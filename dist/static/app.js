(function (React, ReactDOM, reactRouterDom, rxjs, ajax, operators) {
    'use strict';

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */
    /* global Reflect, Promise */

    var extendStatics = function(d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };

    function __extends(d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    }

    var __assign = function() {
        __assign = Object.assign || function __assign(t) {
            for (var s, i = 1, n = arguments.length; i < n; i++) {
                s = arguments[i];
                for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
            }
            return t;
        };
        return __assign.apply(this, arguments);
    };

    function __values(o) {
        var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
        if (m) return m.call(o);
        if (o && typeof o.length === "number") return {
            next: function () {
                if (o && i >= o.length) o = void 0;
                return { value: o && o[i++], done: !o };
            }
        };
        throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
    }

    function __read(o, n) {
        var m = typeof Symbol === "function" && o[Symbol.iterator];
        if (!m) return o;
        var i = m.call(o), r, ar = [], e;
        try {
            while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
        }
        catch (error) { e = { error: error }; }
        finally {
            try {
                if (r && !r.done && (m = i["return"])) m.call(i);
            }
            finally { if (e) throw e.error; }
        }
        return ar;
    }

    function __spread() {
        for (var ar = [], i = 0; i < arguments.length; i++)
            ar = ar.concat(__read(arguments[i]));
        return ar;
    }

    var getCookies = function () {
        return Object.fromEntries(document.cookie.split(/; */).map(function (c) {
            var _a = __read(c.split('=')), key = _a[0], v = _a.slice(1);
            return [key, decodeURIComponent(v.join('='))];
        }));
    };

    var getCookies$1 = function () {
        return Object.fromEntries(document.cookie.split(/; */).map(function (c) {
            var _a = __read(c.split('=')), key = _a[0], v = _a.slice(1);
            return [key, decodeURIComponent(v.join('='))];
        }));
    };
    var iconFromMIME = function (mimeType) {
        var e_1, _a;
        var icons = {
            image: 'fa-file-image',
            audio: 'fa-file-audio',
            video: 'fa-file-video',
            folder: 'fa-folder',
            'application/pdf': 'fa-file-pdf',
            'application/msword': 'fa-file-word',
            'application/vnd.ms-word': 'fa-file-word',
            'application/vnd.oasis.opendocument.text': 'fa-file-word',
            'application/vnd.openxmlformats-officedocument.wordprocessingml': 'fa-file-word',
            'application/vnd.ms-excel': 'fa-file-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml': 'fa-file-excel',
            'application/vnd.oasis.opendocument.spreadsheet': 'fa-file-excel',
            'application/vnd.ms-powerpoint': 'fa-file-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml': 'fa-file-powerpoint',
            'application/vnd.oasis.opendocument.presentation': 'fa-file-powerpoint',
            'text/plain': 'fa-file-alt',
            'text/html': 'fa-file-code',
            'application/json': 'fa-file-code',
            'application/gzip': 'fa-file-archive',
            'application/zip': 'fa-file-archive',
        };
        try {
            for (var _b = __values(Object.entries(icons)), _c = _b.next(); !_c.done; _c = _b.next()) {
                var _d = __read(_c.value, 2), key = _d[0], value = _d[1];
                if (mimeType.search(key) === 0) {
                    return value;
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_1) throw e_1.error; }
        }
        return 'fa-file';
    };

    var FolderMIME = 'application/vnd.google-apps.folder';
    var FileOrderInfos = {
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
    var DefaultOrderChoice = {
        field: 'modifiedTime',
        descending: true,
    };
    var FileList = function () {
        var folderID = reactRouterDom.useParams().folderID;
        var _a = __read(React.useState([]), 2), path = _a[0], setPath = _a[1];
        var _b = __read(React.useState([]), 2), files = _b[0], setFiles = _b[1];
        var _c = __read(React.useState([]), 2), drives = _c[0], setDrives = _c[1];
        var _d = __read(React.useState(false), 2), loading = _d[0], setLoading = _d[1];
        var _e = __read(React.useState(''), 2), searchQuery = _e[0], setSearchQuery = _e[1];
        var _f = __read(React.useState(), 2), pagingToken = _f[0], setPagingToken = _f[1];
        var history = reactRouterDom.useHistory();
        var location = reactRouterDom.useLocation();
        var query = new URLSearchParams(location.search);
        var isSearch = location.pathname.startsWith('/search');
        if (isSearch) {
            var q = query.get('q');
            if (q) {
                if (q !== searchQuery) {
                    setSearchQuery(q);
                }
            }
            else {
                if (searchQuery !== '') {
                    setSearchQuery('');
                }
            }
        }
        var highlight = query.get('highlight');
        var orderBy = DefaultOrderChoice;
        {
            var field = query.get('orderBy');
            if (field && FileOrderInfos[field]) {
                orderBy.field = field;
                orderBy.descending = FileOrderInfos[field].defaultDescending;
                var desc = query.get('desc');
                if (desc != null) {
                    orderBy.descending = desc === 'true';
                }
            }
        }
        var orderInfo = FileOrderInfos[orderBy.field];
        var cookies = getCookies$1();
        var linkToFolder = function (parent, highlight) {
            var url = __assign(__assign({}, location), { pathname: "/folder/" + parent });
            var search = new URLSearchParams(url.search);
            if (highlight && highlight !== '') {
                search.set('highlight', highlight);
            }
            url.search = search.toString();
            return url;
        };
        var linkToFile = function (file) {
            return "/file/" + file.id + "/" + encodeURIComponent(file.name) + "?t=" + cookies['t'];
        };
        var linkWithOrder = function (field, desc) {
            var query = new URLSearchParams(location.search);
            query.set('orderBy', field);
            if (desc) {
                query.set('desc', 'true');
            }
            else {
                query.delete('desc');
            }
            return __assign(__assign({}, location), { search: query.toString() });
        };
        var highlightClassNames = function (id) {
            var cls = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                cls[_i - 1] = arguments[_i];
            }
            if (highlight === id) {
                cls.push('file-list-highlight');
            }
            return cls.join(' ');
        };
        var _g = __read(React.useState(new rxjs.Subject()), 1), ls$ = _g[0];
        React.useEffect(function () {
            var subscription = ls$
                .pipe(operators.switchMap(function (_a) {
                var url = _a.url, files = _a.files, drives = _a.drives;
                setLoading(true);
                return ajax.ajax.getJSON(url).pipe(operators.tap(function (_a) {
                    var _files = _a.files, _drives = _a.drives, nextPageToken = _a.nextPageToken;
                    setFiles(files.concat(_files || []));
                    setDrives(drives.concat(_drives || []));
                    setPagingToken(nextPageToken);
                    setLoading(false);
                }));
            }))
                .subscribe();
            return function () { return subscription.unsubscribe(); };
        }, []);
        var ls = function (files, drives, pagingToken) {
            var url = new URL(window.location.protocol + "//" + window.location.host + "/api/list");
            if (folderID) {
                url.searchParams.set('parent', folderID);
            }
            if (pagingToken) {
                url.searchParams.set('pageToken', pagingToken);
            }
            url.searchParams.set('orderBy', orderBy.descending ? orderInfo.descendingQuery : orderInfo.ascendingQuery);
            ls$.next({ url: url.toString(), files: files, drives: drives });
        };
        var _h = __read(React.useState(new rxjs.Subject()), 1), search$ = _h[0];
        React.useEffect(function () {
            var subscription = search$
                .pipe(operators.switchMap(function (_a) {
                var url = _a.url, files = _a.files;
                setLoading(true);
                return ajax.ajax.getJSON(url).pipe(operators.tap(function (_a) {
                    var _files = _a.files, nextPageToken = _a.nextPageToken;
                    setFiles(files.concat(_files || []));
                    setPagingToken(nextPageToken);
                    setLoading(false);
                }));
            }))
                .subscribe();
            return function () { return subscription.unsubscribe(); };
        }, []);
        var search = function (files, pagingToken) {
            var url = new URL(window.location.protocol + "//" + window.location.host + "/api/search");
            url.searchParams.set('q', searchQuery);
            if (pagingToken) {
                url.searchParams.set('pageToken', pagingToken);
            }
            search$.next({ url: url.toString(), files: files });
        };
        React.useEffect(function () {
            setFiles([]);
            setDrives([]);
            setPagingToken(undefined);
            if (isSearch) {
                search([]);
            }
            else {
                ls([], []);
            }
        }, [isSearch, isSearch ? searchQuery : folderID, orderBy.field, orderBy.descending]);
        var _j = __read(React.useState(new rxjs.Subject()), 1), walk$ = _j[0];
        React.useEffect(function () {
            var subscription = walk$
                .pipe(operators.switchMap(function (walk) {
                var walkStep$ = new rxjs.BehaviorSubject(walk);
                return walkStep$.pipe(operators.concatMap(function (_a) {
                    var folderID = _a.folderID, path = _a.path;
                    var url = new URL(window.location.protocol + "//" + window.location.host + "/api/file");
                    url.searchParams.set('id', folderID);
                    return ajax.ajax.getJSON(url.toString()).pipe(operators.map(function (file) {
                        path = __spread([file], path);
                        if (file.parents && file.parents.length > 0) {
                            walkStep$.next({ folderID: file.parents[0], path: path });
                        }
                        else {
                            walkStep$.complete();
                        }
                        setPath(path);
                        return path;
                    }));
                }));
            }))
                .subscribe();
            return function () { return subscription.unsubscribe(); };
        }, []);
        var walk = function (folderID, path) {
            if (folderID) {
                walk$.next({ folderID: folderID, path: path });
            }
        };
        React.useEffect(function () {
            setPath([]);
            if (!isSearch) {
                walk(folderID, []);
            }
        }, [isSearch, isSearch ? searchQuery : folderID]);
        return (React.createElement("div", { className: "file-list" },
            React.createElement("div", { className: "nav" },
                React.createElement("a", { href: "/logout", className: "button" }, "Logout"),
                React.createElement("div", { className: "dropdown" },
                    React.createElement(reactRouterDom.Link, { to: linkWithOrder(orderBy.field, !orderBy.descending), className: "dropdown-choice" },
                        React.createElement("i", { className: "fas " + (orderBy.descending ? orderInfo.descendingIcon : orderInfo.ascendingIcon) }),
                        orderInfo.name),
                    React.createElement("div", { className: "dropdown-content" }, Object.values(FileOrderInfos)
                        .filter(function (info) { return info.field !== orderBy.field; })
                        .map(function (info) { return (React.createElement(reactRouterDom.Link, { to: linkWithOrder(info.field, info.defaultDescending), className: "dropdown-option" },
                        React.createElement("i", { className: "fas " + (info.defaultDescending ? info.descendingIcon : info.ascendingIcon) }),
                        info.name)); }))),
                React.createElement("input", { type: "text", className: "search-input", placeholder: "Search...", value: searchQuery, onKeyUp: function (event) {
                        var search = new URLSearchParams();
                        search.set('q', searchQuery);
                        if (event.key === 'Enter') {
                            history.push("/search?" + search.toString());
                        }
                    }, onChange: function (event) { return setSearchQuery(event.target.value); } })),
            React.createElement("div", { className: "file-list-table" },
                (function () {
                    var e_1, _a;
                    var parents = [
                        React.createElement(reactRouterDom.Link, { to: "/", className: "file-list-row" },
                            React.createElement("div", { className: "file-list-column" },
                                React.createElement("i", { className: "fas fa-folder" })),
                            React.createElement("div", { className: "file-list-column" }, "/")),
                    ];
                    var fullPath = '/';
                    try {
                        for (var _b = __values(path.entries()), _c = _b.next(); !_c.done; _c = _b.next()) {
                            var _d = __read(_c.value, 2), i = _d[0], file = _d[1];
                            if (i == path.length - 1) {
                                document.title = file.name;
                            }
                            fullPath += file.name + '/';
                            parents.push(React.createElement(reactRouterDom.Link, { to: linkToFolder(file.id), className: "file-list-row" },
                                React.createElement("div", { className: "file-list-column" },
                                    React.createElement("i", { className: "fas fa-folder" })),
                                React.createElement("div", { className: "file-list-column" }, fullPath)));
                        }
                    }
                    catch (e_1_1) { e_1 = { error: e_1_1 }; }
                    finally {
                        try {
                            if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                        }
                        finally { if (e_1) throw e_1.error; }
                    }
                    return parents;
                })(),
                React.createElement("hr", null),
                drives.map(function (drive) { return (React.createElement(reactRouterDom.Link, { to: linkToFolder(drive.id), className: highlightClassNames(drive.id, 'file-list-row') },
                    React.createElement("div", { className: "file-list-column" },
                        React.createElement("i", { className: "fas fa-hdd" })),
                    React.createElement("div", { className: "file-list-column" }, drive.name))); }),
                files.map(function (file) {
                    if (file.mimeType === FolderMIME) {
                        return (React.createElement(reactRouterDom.Link, { to: linkToFolder(isSearch ? file.parents[0] : file.id, isSearch ? file.id : undefined), className: highlightClassNames(file.id, 'file-list-row') },
                            React.createElement("div", { className: "file-list-column" },
                                React.createElement("i", { className: "fas fa-folder" })),
                            React.createElement("div", { className: "file-list-column" }, file.name)));
                    }
                    else {
                        if (isSearch) {
                            return (React.createElement(reactRouterDom.Link, { to: linkToFolder(file.parents[0], file.id), className: highlightClassNames(file.id, 'file-list-row') },
                                React.createElement("div", { className: "file-list-column" },
                                    React.createElement("i", { className: "fas " + iconFromMIME(file.mimeType) })),
                                React.createElement("div", { className: "file-list-column" }, file.name)));
                        }
                        else {
                            return (React.createElement("a", { href: linkToFile(file), target: "_blank", rel: "nofollow", className: highlightClassNames(file.id, 'file-list-row') },
                                React.createElement("div", { className: "file-list-column" },
                                    React.createElement("i", { className: "fas " + iconFromMIME(file.mimeType) })),
                                React.createElement("div", { className: "file-list-column" }, file.name)));
                        }
                    }
                }),
                (function () {
                    if (loading) {
                        return (React.createElement("div", { className: "file-list-row" },
                            React.createElement("div", { className: "file-list-column" },
                                React.createElement("i", { className: "fas fa-sync fa-spin" })),
                            React.createElement("div", { className: "file-list-column" }, "Loading...")));
                    }
                    if (pagingToken) {
                        return (React.createElement("a", { onClick: function () { return (isSearch ? search(files, pagingToken) : ls(files, drives, pagingToken)); }, href: "javascript:void(0)", className: "file-list-row" },
                            React.createElement("div", { className: "file-list-column" },
                                React.createElement("i", { className: "fas fa-sync" })),
                            React.createElement("div", { className: "file-list-column file-list-load-more" }, "Load More")));
                    }
                    return;
                })())));
    };

    var LoginForm = function () { return (React.createElement("div", { className: "central screen-height" },
        React.createElement("form", { className: "login-form central", action: "/login", method: "POST", autoComplete: "off" },
            React.createElement("input", { name: "name", type: "text", placeholder: "Username", autoFocus: true }),
            React.createElement("input", { name: "pass", type: "password", placeholder: "Password" }),
            React.createElement("input", { type: "submit", value: "Login", className: "button" })))); };

    var Home = function () {
        var cookies = getCookies();
        if (typeof cookies['t'] === 'string' && cookies['t'] !== '') {
            return React.createElement(FileList, null);
        }
        else {
            return React.createElement(LoginForm, null);
        }
    };
    var App = (function (_super) {
        __extends(App, _super);
        function App() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.render = function () { return (React.createElement(reactRouterDom.BrowserRouter, null,
                React.createElement(reactRouterDom.Switch, null,
                    React.createElement(reactRouterDom.Route, { exact: true, path: "/" },
                        React.createElement(Home, null)),
                    React.createElement(reactRouterDom.Route, { path: "/folder/:folderID" },
                        React.createElement(FileList, null)),
                    React.createElement(reactRouterDom.Route, { path: "/search" },
                        React.createElement(FileList, null))))); };
            return _this;
        }
        return App;
    }(React.Component));

    ReactDOM.render(React.createElement(App, null), document.body);

}(React, ReactDOM, ReactRouterDOM, rxjs, rxjs.ajax, rxjs.operators));
//# sourceMappingURL=app.js.map
