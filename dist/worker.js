(function () {
    'use strict';

    const str2buf = (s) => Uint8Array.from(s, c => c.charCodeAt(0));
    const buf2str = (b) => String.fromCharCode(...new Uint8Array(b));
    const buf2hex = (b) => Array.prototype.map.call(new Uint8Array(b), x => ('00' + x.toString(16)).slice(-2)).join('');
    const base64 = {
        decode: (s) => str2buf(atob(s)),
        encode: (b) => btoa(buf2str(b)),
        decodeToString: (s) => atob(s),
        encodeString: (b) => btoa(b),
        RAWURL: {
            decode: (s) => base64.decode(s.replace(/-/g, '+').replace(/_/g, '/')),
            encode: (b) => base64
                .encode(b)
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=/g, ''),
            decodeToString: (s) => atob(s.replace(/-/g, '+').replace(/_/g, '/')),
            encodeString: (b) => btoa(b)
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=/g, ''),
        },
    };
    const parseCookie = (str) => str
        .split(';')
        .map(v => v.split('='))
        .reduce((acc, v) => {
        acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(v[1].trim());
        return acc;
    }, {});

    const config = {
        secret: '__SECRET__',
        accounts: Array.from({ length: __ACCOUNTS_COUNT__ }, (_, i) => `__ACCOUNTS_URL__${i + 1}`),
        accountRotation: __ACCOUNT_ROTATION__,
        accountCandidates: __ACCOUNT_CANDIDATES__,
        userURL: async (user) => '__USERS_URL__' + buf2hex(await crypto.subtle.digest('SHA-256', str2buf(config.secret + user))),
        static: async (pathname) => '__STATIC_URL__' + pathname,
    };

    class GoogleDrive {
        constructor(config) {
            this.config = config;
        }
        async getUser(user) {
            return JSON.parse(buf2str(await this.decrypt('user', await (await fetch(await this.config.userURL(user))).arrayBuffer())));
        }
        async download(account, id, range = '') {
            const url = new URL(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
            if (account == null) {
                account = await this.pickAccount();
            }
            return fetch(url.toString(), {
                headers: {
                    Range: range,
                    Authorization: `Bearer ${await this.accessToken(account)}`,
                },
            });
        }
        async file(account, id) {
            if (account == null) {
                account = await this.pickAccount();
            }
            const token = await this.accessToken(account);
            const [file, drive] = await Promise.all([
                (async () => {
                    const url = new URL(`https://www.googleapis.com/drive/v3/files/${id}`);
                    url.searchParams.set('supportsAllDrives', 'true');
                    url.searchParams.set('fields', 'id,name,kind,mimeType,size,modifiedTime,parents,md5Checksum');
                    return (await fetch(url.toString(), {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    })).json();
                })(),
                (async () => {
                    const url = new URL(`https://www.googleapis.com/drive/v3/drives/${id}`);
                    url.searchParams.set('fields', 'id,name,kind');
                    return (await fetch(url.toString(), {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    })).json();
                })(),
            ]);
            if (!drive.error) {
                file.kind = drive.kind;
                file.name = drive.name;
            }
            return file;
        }
        async search(account, options) {
            let pageTokenMap = {};
            let { query, drives, encrypted_page_token } = options;
            if (account == null && typeof encrypted_page_token === 'string' && encrypted_page_token !== '') {
                const data = JSON.parse(buf2str(await this.decrypt('pageToken', base64.RAWURL.decode(encrypted_page_token))));
                account = data.account;
                pageTokenMap = data.pageTokenMap;
            }
            if (account == null) {
                account = await this.pickAccount();
            }
            const url = new URL('https://www.googleapis.com/drive/v3/files');
            url.searchParams.set('includeItemsFromAllDrives', 'true');
            url.searchParams.set('supportsAllDrives', 'true');
            url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)');
            url.searchParams.set('pageSize', '100');
            const clauses = [];
            query
                .replace(/\\/, '\\\\')
                .replace(/'/, "\\'")
                .split(/\s+/)
                .forEach((term) => term !== '' && clauses.push(`fullText contains '${term}'`));
            clauses.push('trashed = false');
            url.searchParams.set('q', clauses.join(' and '));
            const searchInDrive = async (drive) => {
                const _url = new URL(url.toString());
                if (drive) {
                    _url.searchParams.set('driveId', drive);
                    _url.searchParams.set('corpora', 'drive');
                    if (pageTokenMap[drive]) {
                        _url.searchParams.set('pageToken', pageTokenMap[drive]);
                    }
                }
                else {
                    _url.searchParams.set('corpora', 'allDrives');
                    if (pageTokenMap['global']) {
                        _url.searchParams.set('pageToken', pageTokenMap['global']);
                    }
                }
                const response = await (await fetch(_url.toString(), {
                    headers: {
                        Authorization: `Bearer ${await this.accessToken(account)}`,
                    },
                })).json();
                if (response.nextPageToken) {
                    if (drive) {
                        pageTokenMap[drive] = response.nextPageToken;
                    }
                    else {
                        pageTokenMap['global'] = response.nextPageToken;
                    }
                }
                else {
                    if (drive) {
                        delete pageTokenMap[drive];
                    }
                    else if (pageTokenMap['global']) {
                        delete pageTokenMap['global'];
                    }
                }
                console.log('url = ', _url.toString());
                console.log('token = ', await this.accessToken(account));
                console.log('drive = ', drive, response);
                if (!response.files) {
                    response.files = [];
                }
                return response;
            };
            const promises = [];
            if (drives && drives.length > 0) {
                for (const drive of drives) {
                    promises.push(searchInDrive(drive));
                }
            }
            else {
                promises.push(searchInDrive());
            }
            const responses = await Promise.all(promises);
            let nextPageToken;
            if (Object.keys(pageTokenMap).length > 0) {
                nextPageToken = base64.RAWURL.encode(await this.encrypt('pageToken', JSON.stringify({ account, pageTokenMap })));
            }
            let files = [];
            for (const response of responses) {
                files = [...files, ...response.files];
            }
            return { nextPageToken, files };
        }
        async ls(account, parent, orderBy, encrypted_page_token) {
            let pageToken;
            if (account == null && typeof encrypted_page_token === 'string' && encrypted_page_token !== '') {
                const data = JSON.parse(buf2str(await this.decrypt('pageToken', base64.RAWURL.decode(encrypted_page_token))));
                account = data.account;
                pageToken = data.pageToken;
            }
            if (account == null) {
                account = await this.pickAccount();
            }
            let url;
            if (parent) {
                url = new URL('https://www.googleapis.com/drive/v3/files');
                url.searchParams.set('includeItemsFromAllDrives', 'true');
                url.searchParams.set('supportsAllDrives', 'true');
                url.searchParams.set('q', `'${parent}' in parents and trashed = false`);
                url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)');
                url.searchParams.set('pageSize', '100');
                if (orderBy) {
                    url.searchParams.set('orderBy', orderBy);
                }
                else {
                    url.searchParams.set('orderBy', 'folder,name,modifiedTime desc');
                }
            }
            else {
                url = new URL('https://www.googleapis.com/drive/v3/drives');
                url.searchParams.set('pageSize', '100');
            }
            if (pageToken) {
                url.searchParams.set('pageToken', pageToken);
            }
            const response = await (await fetch(url.toString(), {
                headers: {
                    Authorization: `Bearer ${await this.accessToken(account)}`,
                },
            })).json();
            let nextPageToken;
            if (response.nextPageToken) {
                nextPageToken = base64.RAWURL.encode(await this.encrypt('pageToken', JSON.stringify({
                    account,
                    pageToken: response.nextPageToken,
                })));
            }
            return {
                nextPageToken,
                files: response.files,
                drives: response.drives,
            };
        }
        async copyFileInit(account, src, dst) {
            if (account == null) {
                account = await this.pickAccount();
            }
            const file = await this.file(account, src);
            const url = new URL('https://www.googleapis.com/upload/drive/v3/files');
            url.searchParams.set('uploadType', 'resumable');
            url.searchParams.set('supportsAllDrives', 'true');
            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${await this.accessToken(account)}`,
                    'Content-Type': 'application/json; charset=UTF-8',
                    'X-Upload-Content-Type': `${file.mimeType}`,
                    'X-Upload-Content-Length': `${file.size}`,
                },
                body: JSON.stringify({
                    name: file.name,
                    parents: [dst],
                }),
            });
            const location = new URL(response.headers.get('Location'));
            console.log(location.toString());
            return new Response(JSON.stringify({ ...file, token: location.searchParams.get('upload_id') }));
        }
        async copyFileExec(account, src, token) {
            if (account == null) {
                account = await this.pickAccount();
            }
            const location = `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&upload_id=${token}`;
            const data = await this.download(account, src);
            return fetch(location, {
                method: 'PUT',
                headers: {
                    'Content-Length': data.headers.get('Content-Length'),
                    'Content-Type': data.headers.get('Content-Type'),
                },
                body: data.body,
            });
        }
        async copyFileStat(account, token) {
            const location = `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&upload_id=${token}`;
            const response = await fetch(location, {
                method: 'PUT',
                headers: {
                    'Content-Range': 'bytes */*',
                },
            });
            if (response.status === 200) {
                const file = await response.json();
                return new Response(JSON.stringify({ ...file, status: 'uploaded' }));
            }
            if (response.status === 404) {
                return new Response(JSON.stringify({ status: 'expired' }));
            }
            if (response.status === 308) {
                const range = response.headers.get('Range');
                let uploaded = 0;
                if (range) {
                    const m = range.match(/bytes=0-(\d+)/);
                    if (m) {
                        uploaded = parseInt(m[1]);
                    }
                }
                return new Response(JSON.stringify({ status: 'uploading', uploaded }));
            }
            return new Response(JSON.stringify({ status: 'error', message: `unexpected API response status: ${response.status}` }));
        }
        async secretKey(namespace) {
            const { config: { secret }, } = this;
            return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', str2buf(secret + ':' + namespace)), 'AES-GCM', true, ['encrypt', 'decrypt']);
        }
        async encrypt(namespace, data) {
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.secretKey(namespace), typeof data === 'string' ? str2buf(data) : new Uint8Array(data)));
            const packed = new Uint8Array(12 + ciphertext.byteLength);
            packed.set(iv);
            packed.set(ciphertext, 12);
            return packed;
        }
        async decrypt(namespace, data) {
            if (typeof data === 'string') {
                data = base64.decode(data);
            }
            if (!(data instanceof Uint8Array)) {
                data = new Uint8Array(data);
            }
            const iv = new Uint8Array(data.buffer, 0, 12);
            const ciphertext = new Uint8Array(data.buffer, 12);
            return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await this.secretKey(namespace), ciphertext);
        }
        async pickAccount() {
            const { config: { secret, accounts, accountRotation, accountCandidates }, } = this;
            const candidates = [];
            if (accounts.length <= accountCandidates) {
                candidates.push(...accounts);
            }
            else {
                const seed = secret + Math.floor(Date.now() / 1000 / accountRotation).toString();
                const rand = new Uint32Array(await crypto.subtle.digest('SHA-256', str2buf(seed)))[0];
                for (let i = rand % accounts.length, j = 0; j < accountCandidates; i = (i + 1) % accounts.length, ++j) {
                    candidates.push(accounts[i]);
                }
            }
            const account = candidates[Math.floor(Math.random() * candidates.length)];
            if (typeof account === 'string') {
                const ciphertext = await (await fetch(account)).arrayBuffer();
                const plaintext = buf2str(await this.decrypt('account', ciphertext));
                return JSON.parse(plaintext);
            }
            else {
                return account;
            }
        }
        async accessToken(account) {
            if (account.expires == undefined || account.expires < Date.now()) {
                let token;
                if (account.type == 'authorized_user') {
                    token = await this.fetchOauth2Token(account);
                }
                else {
                    token = await this.fetchJwtToken(account);
                }
                if (token.access_token != undefined) {
                    account.access_token = token.access_token;
                    account.expires = Date.now() + Math.max(0, token.expires_in - 100) * 1000;
                }
            }
            return account.access_token;
        }
        async fetchOauth2Token(account) {
            const url = new URL('https://oauth2.googleapis.com/token');
            const form = new URLSearchParams();
            form.set('client_id', account.client_id);
            form.set('client_secret', account.client_secret);
            form.set('refresh_token', account.refresh_token);
            form.set('grant_type', 'refresh_token');
            return (await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: form.toString(),
            })).json();
        }
        async fetchJwtToken(account) {
            const headers = {
                alg: 'RS256',
                typ: 'JWT',
                kid: account.private_key_id,
            };
            const now = Math.floor(Date.now() / 1000) - 10;
            const claimSet = {
                iat: now,
                exp: now + 3600,
                iss: account.client_email,
                aud: account.token_uri,
                scope: 'https://www.googleapis.com/auth/drive',
            };
            const body = base64.RAWURL.encodeString(JSON.stringify(headers)) +
                '.' +
                base64.RAWURL.encodeString(JSON.stringify(claimSet));
            const privateKey = await this.importRSAPEMPrivateKey(account.private_key);
            const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, str2buf(body));
            const jws = body + '.' + base64.encode(sig);
            const url = new URL('https://oauth2.googleapis.com/token');
            const form = new URLSearchParams();
            form.set('assertion', jws);
            form.set('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
            return (await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: form.toString(),
            })).json();
        }
        async importRSAPEMPrivateKey(pem) {
            const pemHeader = '-----BEGIN PRIVATE KEY-----';
            const pemFooter = '-----END PRIVATE KEY-----';
            const lines = pem.split(/[\r\n]+/);
            let pemContent = '';
            let inContent = false;
            for (let line of lines) {
                line = line.trim();
                if (inContent) {
                    if (line === pemFooter) {
                        break;
                    }
                    pemContent += line;
                }
                else if (line === pemHeader) {
                    inContent = true;
                }
            }
            const binaryDer = base64.decode(pemContent);
            return crypto.subtle.importKey('pkcs8', binaryDer, {
                name: 'RSASSA-PKCS1-v1_5',
                hash: 'SHA-256',
            }, true, ['sign']);
        }
    }

    async function handleRequest(request) {
        try {
            const gd = new GoogleDrive(config);
            const url = new URL(request.url);
            const params = url.searchParams;
            const { method, headers } = request;
            let user;
            let form;
            let cookie = {};
            if (method === 'POST' && headers.has('Content-Type') && headers.get('Content-Type') !== '') {
                form = await request.formData();
            }
            if (headers.has('Cookie')) {
                cookie = parseCookie(headers.get('Cookie'));
            }
            {
                const t = getParam('t', form, params, cookie);
                if (t) {
                    user = JSON.parse(buf2str(await gd.decrypt('userToken', base64.RAWURL.decode(t))));
                    if (!user || typeof user.name !== 'string' || typeof user.pass !== 'string') {
                        user = undefined;
                    }
                    else {
                        const userData = await gd.getUser(user.name);
                        if (user.name !== userData.name || user.pass !== userData.pass) {
                            user = undefined;
                        }
                        else {
                            user = userData;
                        }
                    }
                }
            }
            if (url.pathname === '/login') {
                const name = getParam('name', form, params);
                const pass = getParam('pass', form, params);
                if (name && name !== '') {
                    const user = await gd.getUser(name);
                    if (user && user.name === name && user.pass === pass) {
                        const t = base64.RAWURL.encode(await gd.encrypt('userToken', JSON.stringify(user, ['name', 'pass'])));
                        return new Response(null, {
                            status: 307,
                            headers: { Location: `${url.protocol}//${url.host}`, 'Set-Cookie': `t=${t}` },
                        });
                    }
                }
            }
            if (url.pathname === '/logout') {
                return new Response(null, {
                    status: 307,
                    headers: {
                        Location: `${url.protocol}//${url.host}`,
                        'Set-Cookie': `t=deleted; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`,
                    },
                });
            }
            if (url.pathname === '/api/list' && user) {
                const parent = getParam('parent', form, params);
                const orderBy = getParam('orderBy', form, params);
                const pageToken = getParam('pageToken', form, params);
                if (!parent || validDriveForUser(parent, user)) {
                    const fileList = await gd.ls(null, parent, orderBy, pageToken);
                    if (fileList && fileList.drives != null) {
                        fileList.drives = fileList.drives.filter((drive) => validDriveForUser(drive.id, user, !parent));
                    }
                    return new Response(JSON.stringify(fileList), { headers: { 'Content-Type': 'application/json' } });
                }
            }
            if (url.pathname === '/api/search' && user) {
                const query = getParam('q', form, params) || '';
                const encrypted_page_token = getParam('pageToken', form, params);
                const drives = [];
                if (user.drives_black_list && user.drives_black_list.length > 0) {
                    ((await gd.ls()).drives || []).forEach((drive) => {
                        user.drives_black_list.indexOf(drive.id) < 0 && drives.push(drive.id);
                    });
                }
                else if (user.drives_white_list && user.drives_white_list.length > 0) {
                    drives.push(...user.drives_white_list);
                }
                const fileList = await gd.search(null, { query, drives, encrypted_page_token });
                return new Response(JSON.stringify(fileList), { headers: { 'Content-Type': 'application/json' } });
            }
            if (url.pathname === '/api/file' && user) {
                const id = getParam('id', form, params);
                if (!id || validDriveForUser(id, user)) {
                    const file = await gd.file(null, id);
                    if (file &&
                        (file.parents == null ||
                            file.parents.every((parent) => validDriveForUser(parent, user)))) {
                        return new Response(JSON.stringify(file), { headers: { 'Content-Type': 'application/json' } });
                    }
                }
            }
            if (url.pathname === '/api/copyFileInit' && user) {
                const src = getParam('src', form, params);
                const dst = getParam('dst', form, params);
                if (src && dst) {
                    return gd.copyFileInit(null, src, dst);
                }
            }
            if (url.pathname === '/api/copyFileExec' && user) {
                const src = getParam('src', form, params);
                const token = getParam('token', form, params);
                if (src && token) {
                    return gd.copyFileExec(null, src, token);
                }
            }
            if (url.pathname === '/api/copyFileStat' && user) {
                const token = getParam('token', form, params);
                if (token) {
                    return gd.copyFileStat(null, token);
                }
            }
            if (url.pathname.startsWith('/file/') && user) {
                const m = url.pathname.match(/^\/file\/([^\/]+)/);
                if (m) {
                    const fileID = m[1];
                    return gd.download(null, fileID, headers.get('Range') || undefined);
                }
            }
            {
                const pathname = url.pathname === '/' || url.pathname.startsWith('/folder/') ? '/index.html' : url.pathname;
                const response = await fetch(await config.static(pathname));
                const headers = new Headers(response.headers);
                headers.delete('x-xss-protection');
                headers.delete('content-security-policy');
                headers.delete('access-control-allow-origin');
                if (pathname.endsWith('.html')) {
                    headers.set('Content-Type', 'text/html; charset=utf-8');
                }
                else if (pathname.endsWith('.js')) {
                    headers.set('Content-Type', 'application/javascript');
                }
                else if (pathname.endsWith('.css')) {
                    headers.set('Content-Type', 'text/css');
                }
                else if (pathname.endsWith('.ico')) {
                    headers.set('Content-Type', 'image/x-icon');
                }
                return new Response(response.body, {
                    headers,
                });
            }
        }
        catch (err) {
            return new Response(`${err}`, { status: 500 });
        }
    }
    function validDriveForUser(driveID, user, enforceWhileList = false) {
        if (enforceWhileList && user.drives_white_list != null && user.drives_white_list.indexOf(driveID) < 0) {
            return false;
        }
        if (user.drives_black_list != null && user.drives_black_list.indexOf(driveID) >= 0) {
            return false;
        }
        return true;
    }
    function getParam(key, form, params, cookie) {
        let val;
        if (form && form.has(key)) {
            val = form.get(key);
        }
        if (params && params.has(key)) {
            val = params.get(key);
        }
        if (cookie && cookie[key]) {
            val = cookie[key];
        }
        if (val != null) {
            return val;
        }
        return;
    }

    addEventListener('fetch', (event) => {
        event.respondWith(handleRequest(event.request));
    });

}());
//# sourceMappingURL=worker.js.map
