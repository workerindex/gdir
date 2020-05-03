import { base64, str2buf, buf2str } from './utils';

export interface AccessToken {
    expires?: number;
    access_token?: string;
}

export interface GoogleDriveUserAccount extends AccessToken {
    type: 'authorized_user';

    // User Credential fields
    // (These typically come from gcloud auth.)
    client_id: string;
    client_secret: string;
    refresh_token: string;
}

export interface GoogleDriveServiceAccount extends AccessToken {
    type: 'service_account';

    // Service Account fields
    client_email: string;
    private_key_id: string;
    private_key: string;
    token_uri: string;
    project_id: string;
}

export type GoogleDriveAccount = GoogleDriveUserAccount | GoogleDriveServiceAccount;

export interface GoogleDriveConfig {
    // secure random string that provides app-level security
    secret: string;
    accountRotation: number;
    accountCandidates: number;
    accounts: (GoogleDriveAccount | string)[];
    userURL: (user: string) => Promise<string>;
    static: (pathname: string) => Promise<string>;
}

interface TokenResponse {
    access_token: string;
    token_type: string;
    refresh_token: string;
    expires_in: number;
}

interface GDFileList {
    nextPageToken?: string;
    files?: any;
    drives?: any;
}

export interface SearchOptions {
    query: string;
    drives?: string[];
    encrypted_page_token?: string | null;
}

export interface User {
    name: string;
    pass: string;
    drives_white_list?: string[];
    drives_black_list?: string[];
}

export class GoogleDrive {
    constructor(private config: GoogleDriveConfig) {}

    async getUser(user: string): Promise<User> {
        return JSON.parse(
            buf2str(await this.decrypt('user', await (await fetch(await this.config.userURL(user))).arrayBuffer())),
        );
    }

    async download(account: GoogleDriveAccount | null, id: string, range = ''): Promise<Response> {
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

    async file(account: GoogleDriveAccount | null, id: string): Promise<any> {
        if (account == null) {
            account = await this.pickAccount();
        }
        const token = await this.accessToken(account);
        const [file, drive] = await Promise.all([
            (async () => {
                const url = new URL(`https://www.googleapis.com/drive/v3/files/${id}`);
                url.searchParams.set('supportsAllDrives', 'true');
                url.searchParams.set('fields', 'id,name,kind,mimeType,size,modifiedTime,parents,md5Checksum');
                return (
                    await fetch(url.toString(), {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    })
                ).json();
            })(),
            (async () => {
                const url = new URL(`https://www.googleapis.com/drive/v3/drives/${id}`);
                url.searchParams.set('fields', 'id,name,kind');
                return (
                    await fetch(url.toString(), {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    })
                ).json();
            })(),
        ]);

        if (!drive.error) {
            file.kind = drive.kind;
            file.name = drive.name;
        }

        return file;
    }

    async search(account: GoogleDriveAccount | null, options: SearchOptions): Promise<GDFileList | null> {
        let pageTokenMap: Record<string, string> = {};
        let { query, drives, encrypted_page_token } = options;

        if (account == null && typeof encrypted_page_token === 'string' && encrypted_page_token !== '') {
            const data = JSON.parse(
                buf2str(await this.decrypt('pageToken', base64.RAWURL.decode(encrypted_page_token))),
            );
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

        const clauses: string[] = [];

        query
            .replace(/\\/, '\\\\')
            .replace(/'/, "\\'")
            .split(/\s+/)
            .forEach((term) => term !== '' && clauses.push(`fullText contains '${term}'`));

        clauses.push('trashed = false');

        url.searchParams.set('q', clauses.join(' and '));

        const searchInDrive = async (drive?: string) => {
            const _url = new URL(url.toString());

            if (drive) {
                _url.searchParams.set('driveId', drive);
                _url.searchParams.set('corpora', 'drive');
                if (pageTokenMap[drive]) {
                    _url.searchParams.set('pageToken', pageTokenMap[drive]);
                }
            } else {
                _url.searchParams.set('corpora', 'allDrives');
                if (pageTokenMap['global']) {
                    _url.searchParams.set('pageToken', pageTokenMap['global']);
                }
            }

            const response = await (
                await fetch(_url.toString(), {
                    headers: {
                        Authorization: `Bearer ${await this.accessToken(account as GoogleDriveAccount)}`,
                    },
                })
            ).json();

            if (response.nextPageToken) {
                if (drive) {
                    pageTokenMap[drive] = response.nextPageToken;
                } else {
                    pageTokenMap['global'] = response.nextPageToken;
                }
            } else {
                if (drive) {
                    delete pageTokenMap[drive];
                } else if (pageTokenMap['global']) {
                    delete pageTokenMap['global'];
                }
            }

            console.log('url = ', _url.toString());
            console.log('token = ', await this.accessToken(account as GoogleDriveAccount));
            console.log('drive = ', drive, response);

            if (!response.files) {
                response.files = [];
            }

            return response;
        };

        const promises: Promise<any>[] = [];

        if (drives && drives.length > 0) {
            for (const drive of drives) {
                promises.push(searchInDrive(drive));
            }
        } else {
            promises.push(searchInDrive());
        }

        const responses = await Promise.all(promises);

        let nextPageToken: string | undefined;

        if (Object.keys(pageTokenMap).length > 0) {
            nextPageToken = base64.RAWURL.encode(
                await this.encrypt('pageToken', JSON.stringify({ account, pageTokenMap })),
            );
        }

        let files: any[] = [];
        for (const response of responses) {
            files = [...files, ...response.files];
        }

        return { nextPageToken, files };
    }

    async ls(
        account?: GoogleDriveAccount | null,
        parent?: string | null,
        orderBy?: string | null,
        encrypted_page_token?: string | null,
    ): Promise<GDFileList | null> {
        let pageToken: string | undefined;

        if (account == null && typeof encrypted_page_token === 'string' && encrypted_page_token !== '') {
            const data = JSON.parse(
                buf2str(await this.decrypt('pageToken', base64.RAWURL.decode(encrypted_page_token))),
            );
            account = data.account;
            pageToken = data.pageToken;
        }

        if (account == null) {
            account = await this.pickAccount();
        }

        let url: URL;

        if (parent) {
            url = new URL('https://www.googleapis.com/drive/v3/files');
            url.searchParams.set('includeItemsFromAllDrives', 'true');
            url.searchParams.set('supportsAllDrives', 'true');
            url.searchParams.set('q', `'${parent}' in parents and trashed = false`);
            url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)');
            url.searchParams.set('pageSize', '100');
            if (orderBy) {
                url.searchParams.set('orderBy', orderBy);
            } else {
                url.searchParams.set('orderBy', 'folder,name,modifiedTime desc');
            }
        } else {
            url = new URL('https://www.googleapis.com/drive/v3/drives');
            url.searchParams.set('pageSize', '100');
        }
        if (pageToken) {
            url.searchParams.set('pageToken', pageToken);
        }

        const response = await (
            await fetch(url.toString(), {
                headers: {
                    Authorization: `Bearer ${await this.accessToken(account)}`,
                },
            })
        ).json();

        let nextPageToken: string | undefined;
        if (response.nextPageToken) {
            nextPageToken = base64.RAWURL.encode(
                await this.encrypt(
                    'pageToken',
                    JSON.stringify({
                        account,
                        pageToken: response.nextPageToken,
                    }),
                ),
            );
        }

        return {
            nextPageToken,
            files: response.files,
            drives: response.drives,
        };
    }

    async copyFileInit(account: GoogleDriveAccount | null, src: string, dst: string): Promise<Response> {
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
        const location = new URL(response.headers.get('Location') as string);
        console.log(location.toString());
        return new Response(JSON.stringify({ ...file, token: location.searchParams.get('upload_id') as string }));
    }

    async copyFileExec(account: GoogleDriveAccount | null, src: string, token: string): Promise<Response> {
        if (account == null) {
            account = await this.pickAccount();
        }
        const location = `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&upload_id=${token}`;
        const data = await this.download(account, src);
        return fetch(location, {
            method: 'PUT',
            headers: {
                'Content-Length': data.headers.get('Content-Length') as string,
                'Content-Type': data.headers.get('Content-Type') as string,
            },
            body: data.body,
        });
    }

    async copyFileStat(account: GoogleDriveAccount | null, token: string): Promise<Response> {
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
        return new Response(
            JSON.stringify({ status: 'error', message: `unexpected API response status: ${response.status}` }),
        );
    }

    async secretKey(namespace: string): Promise<CryptoKey> {
        const {
            config: { secret },
        } = this;
        return crypto.subtle.importKey(
            'raw',
            await crypto.subtle.digest('SHA-256', str2buf(secret + ':' + namespace)),
            'AES-GCM',
            true,
            ['encrypt', 'decrypt'],
        );
    }

    async encrypt(namespace: string, data: string | ArrayBufferLike): Promise<ArrayBuffer> {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = new Uint8Array(
            await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                await this.secretKey(namespace),
                typeof data === 'string' ? str2buf(data) : new Uint8Array(data),
            ),
        );
        const packed = new Uint8Array(12 + ciphertext.byteLength);
        packed.set(iv);
        packed.set(ciphertext, 12);
        return packed;
    }

    async decrypt(namespace: string, data: string | ArrayBufferLike): Promise<ArrayBuffer> {
        if (typeof data === 'string') {
            data = base64.decode(data);
        }
        if (!(data instanceof Uint8Array)) {
            data = new Uint8Array(data);
        }
        const iv = new Uint8Array((data as Uint8Array).buffer, 0, 12);
        const ciphertext = new Uint8Array((data as Uint8Array).buffer, 12);
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await this.secretKey(namespace), ciphertext);
    }

    async pickAccount(): Promise<GoogleDriveAccount> {
        const {
            config: { secret, accounts, accountRotation, accountCandidates },
        } = this;
        const candidates: typeof accounts = [];
        if (accounts.length <= accountCandidates) {
            candidates.push(...accounts);
        } else {
            // new seed for every accountRotation seconds
            const seed = secret + Math.floor(Date.now() / 1000 / accountRotation).toString();
            // generate a random value from seed
            const rand = new Uint32Array(await crypto.subtle.digest('SHA-256', str2buf(seed)))[0];
            // use the seeded random value as starting point, select accountCandidates consecutive accounts
            for (let i = rand % accounts.length, j = 0; j < accountCandidates; i = (i + 1) % accounts.length, ++j) {
                candidates.push(accounts[i]);
            }
        }
        // choose randomly without seed, an item from the candidates
        const account = candidates[Math.floor(Math.random() * candidates.length)];
        if (typeof account === 'string') {
            const ciphertext = await (await fetch(account)).arrayBuffer();
            const plaintext = buf2str(await this.decrypt('account', ciphertext));
            return JSON.parse(plaintext);
        } else {
            return account;
        }
    }

    async accessToken(account: GoogleDriveAccount): Promise<string> {
        if (account.expires == undefined || account.expires < Date.now()) {
            let token: TokenResponse;
            if (account.type == 'authorized_user') {
                token = await this.fetchOauth2Token(account);
            } else {
                token = await this.fetchJwtToken(account);
            }
            if (token.access_token != undefined) {
                account.access_token = token.access_token;
                account.expires = Date.now() + Math.max(0, token.expires_in - 100) * 1000;
            }
        }
        return account.access_token as string;
    }

    async fetchOauth2Token(account: GoogleDriveUserAccount): Promise<TokenResponse> {
        const url = new URL('https://oauth2.googleapis.com/token');
        const form = new URLSearchParams();
        form.set('client_id', account.client_id);
        form.set('client_secret', account.client_secret);
        form.set('refresh_token', account.refresh_token);
        form.set('grant_type', 'refresh_token');
        return (
            await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: form.toString(),
            })
        ).json();
    }

    async fetchJwtToken(account: GoogleDriveServiceAccount): Promise<TokenResponse> {
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
        const body =
            base64.RAWURL.encodeString(JSON.stringify(headers)) +
            '.' +
            base64.RAWURL.encodeString(JSON.stringify(claimSet));
        const privateKey = await this.importRSAPEMPrivateKey(account.private_key);
        const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, str2buf(body));
        const jws = body + '.' + base64.encode(sig);
        const url = new URL('https://oauth2.googleapis.com/token');
        const form = new URLSearchParams();
        form.set('assertion', jws);
        form.set('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
        return (
            await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: form.toString(),
            })
        ).json();
    }

    async importRSAPEMPrivateKey(pem: string): Promise<CryptoKey> {
        // fetch the part of the PEM string between header and footer
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
            } else if (line === pemHeader) {
                inContent = true;
            }
        }
        const binaryDer = base64.decode(pemContent);

        return crypto.subtle.importKey(
            'pkcs8',
            binaryDer,
            {
                name: 'RSASSA-PKCS1-v1_5',
                hash: 'SHA-256',
            },
            true,
            ['sign'],
        );
    }
}
