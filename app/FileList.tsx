import * as React from 'react';
import { Link, withRouter, RouteComponentProps } from 'react-router-dom';
import { getCookies, iconFromMIME } from 'utils';
import * as H from 'history';

export interface FileListProps {
    parent?: string;
}

interface DriveData {
    kind: 'drive#drive';
    id: string;
    name: string;
}

const FolderMIME = 'application/vnd.google-apps.folder';

interface FileData {
    id: string;
    mimeType: string;
    modifiedTime: string;
    name: string;

    // only for files
    size?: string;

    parents?: string[];
}

interface FileListData {
    nextPageToken?: string;
    files: FileData[];
    drives: DriveData[];
}

interface FileListState extends FileListData {
    loading: boolean;
    parent?: FileData;
}

interface FileOrderInfo {
    name: string;
    field: string;
    defaultDescending: boolean;
    ascendingIcon: string;
    descendingIcon: string;
    ascendingQuery: string;
    descendingQuery: string;
}

interface FileOrderChoice {
    field: string;
    descending?: boolean;
}

const FileOrderInfos: Record<string, FileOrderInfo> = {
    name_natural: {
        name: 'Name',
        field: 'name_natural',
        defaultDescending: false,
        ascendingIcon: 'fa-sort-alpha-down',
        descendingIcon: 'fa-sort-alpha-down-alt',
        ascendingQuery: 'name_natural,folder,modifiedTime desc',
        descendingQuery: 'name_natural desc,folder,modifiedTime desc',
    },
    createdTime: {
        name: 'Created Time',
        field: 'createdTime',
        defaultDescending: true,
        ascendingIcon: 'fa-sort-numeric-down',
        descendingIcon: 'fa-sort-numeric-down-alt',
        ascendingQuery: 'createdTime,name,folder',
        descendingQuery: 'createdTime desc,name,folder',
    },
    modifiedTime: {
        name: 'Modified Time',
        field: 'modifiedTime',
        defaultDescending: true,
        ascendingIcon: 'fa-sort-numeric-down',
        descendingIcon: 'fa-sort-numeric-down-alt',
        ascendingQuery: 'modifiedTime,name,folder',
        descendingQuery: 'modifiedTime desc,name,folder',
    },
    quotaBytesUsed: {
        name: 'Size',
        field: 'quotaBytesUsed',
        defaultDescending: true,
        ascendingIcon: 'fa-sort-numeric-down',
        descendingIcon: 'fa-sort-numeric-down-alt',
        ascendingQuery: 'folder desc,quotaBytesUsed,name,modifiedTime desc',
        descendingQuery: 'folder desc,quotaBytesUsed desc,name,modifiedTime desc',
    },
    folder: {
        name: 'Folders',
        field: 'folder',
        defaultDescending: false,
        ascendingIcon: 'fa-sort-down',
        descendingIcon: 'fa-sort-sort-up',
        ascendingQuery: 'folder,name,modifiedTime desc',
        descendingQuery: 'folder desc,name,modifiedTime desc',
    },
};

const DefaultOrderChoice: FileOrderChoice = {
    field: 'modifiedTime',
    descending: true,
};

class FileList extends React.Component<RouteComponentProps<FileListProps>, FileListState> {
    constructor(public props: RouteComponentProps<FileListProps>) {
        super(props);
        this.state = this.emptyState();
    }

    private emptyState(): FileListState {
        return {
            files: [],
            drives: [],
            loading: false,
        };
    }

    private get orderBy(): FileOrderChoice {
        const { query } = this;
        const field = query.get('orderBy') || '';
        const desc = query.get('desc');
        if (!query.has('orderBy') || field === '') {
            return DefaultOrderChoice;
        }
        return {
            field,
            descending: desc === 'true',
        };
    }

    private get params(): FileListProps {
        return this.props.match.params;
    }

    private get query(): URLSearchParams {
        return new URLSearchParams(this.props.location.search);
    }

    componentDidMount() {
        this.fetchFolder(this.state);
    }

    componentDidUpdate(prevProps: Readonly<RouteComponentProps<FileListProps>>) {
        const { params, query } = this;
        const oldParams = prevProps.match.params;
        const oldQuery = new URLSearchParams(prevProps.location.search);
        if (
            params.parent !== oldParams.parent ||
            query.get('orderBy') !== oldQuery.get('orderBy') ||
            query.get('desc') !== oldQuery.get('desc')
        ) {
            const state = this.emptyState();
            this.setState(state);
            this.fetchFolder(state);
        }
    }

    async fetchFolder(state: FileListState): Promise<void> {
        const { orderBy } = this;
        const { params } = this.props.match;
        this.setState({ ...state, loading: true });
        const url = new URL(`${location.protocol}//${location.host}/api/list`);
        const defered: Promise<any>[] = [];
        if (params.parent) {
            url.searchParams.set('parent', params.parent);
            defered.push(this.fetchFile(params.parent));
        }
        if (state.nextPageToken) {
            url.searchParams.set('pageToken', state.nextPageToken);
        }
        const orderInfo = FileOrderInfos[orderBy.field] as FileOrderInfo;
        url.searchParams.set('orderBy', orderBy.descending ? orderInfo.descendingQuery : orderInfo.ascendingQuery);
        defered.push((async () => (await fetch(url.toString())).json())());
        const results = await Promise.all(defered);
        let list: FileListData;
        let parent: FileData | undefined;
        if (params.parent) {
            parent = results[0];
            list = results[1];
        } else {
            list = results[0];
        }
        this.setState({
            loading: false,
            nextPageToken: list.nextPageToken,
            files: [...state.files, ...(list.files || [])],
            drives: [...state.drives, ...(list.drives || [])],
            parent,
        });
    }

    async fetchFile(id: string): Promise<FileData> {
        const url = new URL(`${location.protocol}//${location.host}/api/file`);
        url.searchParams.set('id', id);
        return (await fetch(url.toString())).json();
    }

    private folderLink(parent: string): H.Location {
        const l = this.props.location;
        return { ...l, pathname: `/folder/${parent}` };
    }

    private toOrderBy(orderBy: FileOrderChoice): H.Location {
        const l = this.props.location;
        const s = new URLSearchParams(l.search);
        s.set('orderBy', orderBy.field);
        if (orderBy.descending) {
            s.set('desc', 'true');
        } else {
            s.delete('desc');
        }
        return { ...l, search: s.toString() };
    }

    private fileLink(file: FileData): string {
        const cookies = getCookies();
        return `/file/${file.id}/${encodeURIComponent(file.name)}?t=${cookies['t']}`;
    }

    render() {
        const { state, orderBy } = this;
        const { parent } = state;
        const orderInfo = FileOrderInfos[orderBy.field] as FileOrderInfo;
        if (parent) {
            document.title = parent.name;
        } else {
            document.title = 'gd';
        }
        return (
            <div className="file-list">
                <div className="nav">
                    <a href="/logout" className="button">
                        Logout
                    </a>
                    <div className="dropdown">
                        <Link
                            to={this.toOrderBy({ field: orderBy.field, descending: !orderBy.descending })}
                            className="dropdown-choice"
                        >
                            <i
                                className={`fas ${
                                    orderBy.descending ? orderInfo.descendingIcon : orderInfo.ascendingIcon
                                }`}
                            ></i>
                            {orderInfo.name}
                        </Link>
                        <div className="dropdown-content">
                            {Object.values(FileOrderInfos)
                                .filter((info) => info.field !== orderBy.field)
                                .map((info) => (
                                    <Link
                                        to={this.toOrderBy({ field: info.field, descending: info.defaultDescending })}
                                        className="dropdown-option"
                                    >
                                        <i
                                            className={`fas ${
                                                info.defaultDescending ? info.descendingIcon : info.ascendingIcon
                                            }`}
                                        ></i>
                                        {info.name}
                                    </Link>
                                ))}
                        </div>
                    </div>
                </div>
                <div className="file-list-table">
                    {(() => {
                        if (parent) {
                            return (
                                <Link
                                    to={
                                        parent.parents && parent.parents.length > 0
                                            ? this.folderLink(parent.parents[0])
                                            : '/'
                                    }
                                    className="file-list-row"
                                >
                                    <div className="file-list-column">
                                        <i className="fas fa-folder"></i>
                                    </div>
                                    <div className="file-list-column">..</div>
                                </Link>
                            );
                        }
                        return;
                    })()}
                    {state.drives.map((drive) => (
                        <Link to={this.folderLink(drive.id)} className="file-list-row">
                            <div className="file-list-column">
                                <i className="fas fa-hdd"></i>
                            </div>
                            <div className="file-list-column">{drive.name}</div>
                        </Link>
                    ))}
                    {state.files.map((file) => {
                        if (file.mimeType === FolderMIME) {
                            return (
                                <Link to={this.folderLink(file.id)} className="file-list-row">
                                    <div className="file-list-column">
                                        <i className="fas fa-folder"></i>
                                    </div>
                                    <div className="file-list-column">{file.name}</div>
                                </Link>
                            );
                        } else {
                            return (
                                <a href={this.fileLink(file)} target="_blank" rel="nofollow" className="file-list-row">
                                    <div className="file-list-column">
                                        <i className={`fas ${iconFromMIME(file.mimeType)}`}></i>
                                    </div>
                                    <div className="file-list-column">{file.name}</div>
                                </a>
                            );
                        }
                    })}
                    {(() => {
                        if (state.loading) {
                            return (
                                <div className="file-list-row">
                                    <div className="file-list-column">
                                        <i className="fas fa-sync fa-spin"></i>
                                    </div>
                                    <div className="file-list-column">Loading...</div>
                                </div>
                            );
                        }
                        if (state.nextPageToken) {
                            return (
                                <a
                                    onClick={() => this.fetchFolder(state)}
                                    href="javascript:void(0)"
                                    className="file-list-row"
                                >
                                    <div className="file-list-column">
                                        <i className="fas fa-sync"></i>
                                    </div>
                                    <div className="file-list-column file-list-load-more">Load More</div>
                                </a>
                            );
                        }
                        return;
                    })()}
                </div>
            </div>
        );
    }
}

export default withRouter(FileList);
