// import html from './index.html';

import config from './config';
import { GoogleDrive, User } from './drive';
import { parseCookie, buf2str, base64 } from './utils';

export async function handleRequest(request: Request): Promise<Response> {
    try {
        const gd = new GoogleDrive(config);
        const url = new URL(request.url);
        const params = url.searchParams;
        const { method, headers } = request;

        let user: User | undefined;
        let form: FormData | undefined;
        let cookie: Record<string, string> = {};

        if (method === 'POST' && headers.has('Content-Type') && headers.get('Content-Type') !== '') {
            form = await request.formData();
        }

        if (headers.has('Cookie')) {
            cookie = parseCookie(headers.get('Cookie') as string);
        }

        {
            const t = getParam('t', form, params, cookie);
            if (t) {
                user = JSON.parse(buf2str(await gd.decrypt('userToken', base64.RAWURL.decode(t))));
                if (!user || typeof user.name !== 'string' || typeof user.pass !== 'string') {
                    user = undefined;
                } else {
                    const userData = await gd.getUser(user.name);
                    if (user.name !== userData.name || user.pass !== userData.pass) {
                        user = undefined;
                    } else {
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
                    const t = base64.RAWURL.encode(
                        await gd.encrypt('userToken', JSON.stringify(user, ['name', 'pass'])),
                    );
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
                    fileList.drives = fileList.drives.filter((drive: any) =>
                        validDriveForUser(drive.id, user as User, !parent),
                    );
                }
                return new Response(JSON.stringify(fileList), { headers: { 'Content-Type': 'application/json' } });
            }
        }

        if (url.pathname === '/api/file' && user) {
            const id = getParam('id', form, params);
            if (!id || validDriveForUser(id, user)) {
                const file = await gd.file(null, id as string);
                if (
                    file &&
                    (file.parents == null ||
                        (file.parents as string[]).every((parent) => validDriveForUser(parent, user as User)))
                ) {
                    return new Response(JSON.stringify(file), { headers: { 'Content-Type': 'application/json' } });
                }
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
            } else if (pathname.endsWith('.js')) {
                headers.set('Content-Type', 'application/javascript');
            } else if (pathname.endsWith('.css')) {
                headers.set('Content-Type', 'text/css');
            } else if (pathname.endsWith('.ico')) {
                headers.set('Content-Type', 'image/x-icon');
            }

            return new Response(response.body, {
                headers,
            });
        }
    } catch (err) {
        return new Response(`${err}`, { status: 500 });
    }
}

function validDriveForUser(driveID: string, user: User, enforceWhileList: boolean = false): boolean {
    if (enforceWhileList && user.drives_white_list != null && user.drives_white_list.indexOf(driveID) < 0) {
        return false;
    }
    if (user.drives_black_list != null && user.drives_black_list.indexOf(driveID) >= 0) {
        return false;
    }
    return true;
}

function getParam(
    key: string,
    form?: FormData,
    params?: URLSearchParams,
    cookie?: Record<string, string>,
): string | undefined {
    let val: string | null | undefined;
    if (form && form.has(key)) {
        val = form.get(key) as string;
    }
    if (params && params.has(key)) {
        val = params.get(key) as string;
    }
    if (cookie && cookie[key]) {
        val = cookie[key];
    }
    if (val != null) {
        return val;
    }
    return;
}
