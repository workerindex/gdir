import * as React from 'react';
import { Subject, BehaviorSubject } from 'rxjs';
import { ajax } from 'rxjs/ajax';
import { switchMap, tap, concatMap, map } from 'rxjs/operators';
import { Link, useLocation, useParams } from 'react-router-dom';
import { getCookies, iconFromMIME } from 'utils';
import * as H from 'history';

export interface FileListProps {
    folderID?: string;
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

interface lsOptions {
    url: string;
    files: FileData[];
    drives: DriveData[];
}

interface walkOptions {
    folderID: string;
    path: FileData[];
}

export const FileList: React.FC<FileListProps> = () => {
    const { folderID } = useParams<FileListProps>();

    const [path, setPath] = React.useState<FileData[]>([]);
    const [files, setFiles] = React.useState<FileData[]>([]);
    const [drives, setDrives] = React.useState<DriveData[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [pagingToken, setPagingToken] = React.useState<string | undefined>();

    const location = useLocation();
    const query = new URLSearchParams(location.search);

    const orderBy = DefaultOrderChoice;
    {
        const field = query.get('orderBy');
        if (field && FileOrderInfos[field]) {
            orderBy.field = field;
            orderBy.descending = FileOrderInfos[field].defaultDescending;
            const desc = query.get('desc');
            if (desc != null) {
                orderBy.descending = desc === 'true';
            }
        }
    }

    const orderInfo = FileOrderInfos[orderBy.field];

    const cookies = getCookies();

    const linkToFolder = (parent: string): H.Location => ({ ...location, pathname: `/folder/${parent}` });

    const linkToFile = (file: FileData): string =>
        `/file/${file.id}/${encodeURIComponent(file.name)}?t=${cookies['t']}`;

    const linkWithOrder = (field: string, desc: boolean): H.Location => {
        const query = new URLSearchParams(location.search);
        query.set('orderBy', field);
        if (desc) {
            query.set('desc', 'true');
        } else {
            query.delete('desc');
        }
        return { ...location, search: query.toString() };
    };

    const [ls$] = React.useState(new Subject<lsOptions>());
    React.useEffect(() => {
        const subscription = ls$
            .pipe(
                switchMap(({ url, files, drives }) => {
                    setLoading(true);
                    return ajax.getJSON<FileListData>(url).pipe(
                        tap(({ files: _files, drives: _drives, nextPageToken }) => {
                            setFiles(files.concat(_files || []));
                            setDrives(drives.concat(_drives || []));
                            setPagingToken(nextPageToken);
                            setLoading(false);
                        }),
                    );
                }),
            )
            .subscribe();
        return () => subscription.unsubscribe();
    }, []);

    const ls = (files: FileData[], drives: DriveData[], pagingToken?: string) => {
        const url = new URL(`${window.location.protocol}//${window.location.host}/api/list`);
        if (folderID) {
            url.searchParams.set('parent', folderID);
        }
        if (pagingToken) {
            url.searchParams.set('pageToken', pagingToken);
        }
        url.searchParams.set('orderBy', orderBy.descending ? orderInfo.descendingQuery : orderInfo.ascendingQuery);
        ls$.next({ url: url.toString(), files, drives });
    };

    React.useEffect(() => {
        setFiles([]);
        setDrives([]);
        setPagingToken(undefined);
        ls([], [], undefined);
    }, [folderID, orderBy.field, orderBy.descending]);

    const [walk$] = React.useState(new Subject<walkOptions>());
    React.useEffect(() => {
        const subscription = walk$
            .pipe(
                switchMap((walk) => {
                    const walkStep$ = new BehaviorSubject<walkOptions>(walk);
                    return walkStep$.pipe(
                        concatMap(({ folderID, path }) => {
                            const url = new URL(`${window.location.protocol}//${window.location.host}/api/file`);
                            url.searchParams.set('id', folderID);
                            return ajax.getJSON<FileData>(url.toString()).pipe(
                                map((file) => {
                                    path = [file, ...path];
                                    if (file.parents && file.parents.length > 0) {
                                        walkStep$.next({ folderID: file.parents[0], path });
                                    } else {
                                        walkStep$.complete();
                                    }
                                    setPath(path);
                                    return path;
                                }),
                            );
                        }),
                    );
                }),
            )
            .subscribe();
        return () => subscription.unsubscribe();
    }, []);

    const walk = (folderID: string | undefined, path: FileData[]) => {
        if (folderID) {
            walk$.next({ folderID, path });
        }
    };

    React.useEffect(() => {
        setPath([]);
        walk(folderID, []);
    }, [folderID]);

    return (
        <div className="file-list">
            <div className="nav">
                <a href="/logout" className="button">
                    Logout
                </a>
                <div className="dropdown">
                    <Link to={linkWithOrder(orderBy.field, !orderBy.descending)} className="dropdown-choice">
                        <i
                            className={`fas ${orderBy.descending ? orderInfo.descendingIcon : orderInfo.ascendingIcon}`}
                        ></i>
                        {orderInfo.name}
                    </Link>
                    <div className="dropdown-content">
                        {Object.values(FileOrderInfos)
                            .filter((info) => info.field !== orderBy.field)
                            .map((info) => (
                                <Link
                                    to={linkWithOrder(info.field, info.defaultDescending)}
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
                    const parents: JSX.Element[] = [
                        <Link to="/" className="file-list-row">
                            <div className="file-list-column">
                                <i className="fas fa-folder"></i>
                            </div>
                            <div className="file-list-column">/</div>
                        </Link>,
                    ];
                    let fullPath = '/';
                    for (const [i, file] of path.entries()) {
                        if (i == path.length - 1) {
                            document.title = file.name;
                        }
                        fullPath += file.name + '/';
                        parents.push(
                            <Link to={linkToFolder(file.id)} className="file-list-row">
                                <div className="file-list-column">
                                    <i className="fas fa-folder"></i>
                                </div>
                                <div className="file-list-column">{fullPath}</div>
                            </Link>,
                        );
                    }
                    return parents;
                })()}
                {drives.map((drive) => (
                    <Link to={linkToFolder(drive.id)} className="file-list-row">
                        <div className="file-list-column">
                            <i className="fas fa-hdd"></i>
                        </div>
                        <div className="file-list-column">{drive.name}</div>
                    </Link>
                ))}
                {files.map((file) => {
                    if (file.mimeType === FolderMIME) {
                        return (
                            <Link to={linkToFolder(file.id)} className="file-list-row">
                                <div className="file-list-column">
                                    <i className="fas fa-folder"></i>
                                </div>
                                <div className="file-list-column">{file.name}</div>
                            </Link>
                        );
                    } else {
                        return (
                            <a href={linkToFile(file)} target="_blank" rel="nofollow" className="file-list-row">
                                <div className="file-list-column">
                                    <i className={`fas ${iconFromMIME(file.mimeType)}`}></i>
                                </div>
                                <div className="file-list-column">{file.name}</div>
                            </a>
                        );
                    }
                })}
                {(() => {
                    if (loading) {
                        return (
                            <div className="file-list-row">
                                <div className="file-list-column">
                                    <i className="fas fa-sync fa-spin"></i>
                                </div>
                                <div className="file-list-column">Loading...</div>
                            </div>
                        );
                    }
                    if (pagingToken) {
                        return (
                            <a
                                onClick={() => ls(files, drives, pagingToken)}
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
};
