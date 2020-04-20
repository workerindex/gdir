# Google Drive Directory

A Cloudflare Worker based front-end and back-end that gives you a reversed proxy for your Google Drive contents!

## Features

-   Supports both User Accounts (UA) with OAuth2 token, and Service Accounts (SA) with JWT token.
-   Unlimited account rotation algorithm. No more 403 error!
    -   Choose a candidates window of 10 accounts every 1 minute, and randomly pick one account from the window for every request.
    -   Listing requests that carry page tokens will use the previous account to avoid paging problems.
-   User login support. Admin can create users with password and optional whitelist and blacklist drive IDs.
-   Use GitHub, Gist, or any free static hosting services to host your encrypted account credentials, user settings, and static resources! Cloudflare Worker itself can only allow 1MB program data.
-   Dark Mode! Yeeeeeeeeee!
-   React.js for front-end render.
-   Written in TypeScript with Gulp tasks! Make development easy!

![Dark Mode](screenshot.png)

## Setup Guide (sort of)

-   Install [Git](https://git-scm.com/), [Node.js with NPM](https://nodejs.org/en/download/), [Golang toolchain](https://golang.org/dl/).
-   Follow [AutoRclone](https://github.com/xyou365/AutoRclone) guide to create your pool of Service Accounts.
-   I recommend adding all your Service Accounts into a Google Group to make it simple for adding all Service Accounts into a Team Drive.

Create 3 different **PRIVATE** [Gists](https://gist.github.com/). You can add an arbitrary file to create them. It doesn't matter what's in it, we will replace their contents later anyway.

The last 32 characters of your Gist URL is the **GISTHASH**. We are going to call your 3 different GISTHASHs the following:

-   `GISTHASH_FOR_ACCOUNTS`
-   `GISTHASH_FOR_USERS`
-   `GISTHASH_FOR_STATIC`

Please take note before you lose yourself.

In your working directory, clone these repositories:

```
git clone https://github.com/workerindex/gdir.git
git clone https://gist.github.com/<GISTHASH_FOR_ACCOUNTS>.git gdir-accounts
git clone https://gist.github.com/<GISTHASH_FOR_USERS>.git gdir-users
git clone https://gist.github.com/<GISTHASH_FOR_STATIC>.git gdir-static
```

Edit `gdir/worker/config.ts` . Replace `GISTHASH_FOR_XXX` with your GISTHASHs. Replace `USERNAME` with your GitHub username. Replace `length: 1000` with the number of Service Accounts you have prepared with AutoRclone. And last, set `secret` with a random string of your choice. You can use your normal password, or generate some random values from somewhere. It has to be kept secret! We denote the secret value as `KEY` for the rest of this document.

Then under `gdir`, run:

```
npm i
npm run build
```

Note: Windows users may or may not experience with random failures with `npm i`. Typically with failure messages like `Error: PERM: operation not permitted`. This is usually your antivirus is reading some files while npm is trying to remove them. Try turning off your antivirus, remove the `node_modules` folder and try again.

This will compile the TypeScript source with your config, into static files in `gdir/dist` folder.

Copy all files except `worker.js` in `gdir/dist` to `gdir-static`. And in `gdir-static` run:

```
git add .
git commit --amend --no-edit --allow-empty-message
git push -f
```

This will publish the front-end static files on Gist. It's very important your don't accidentally copy over `worker.js` as it contains your secret `KEY`!

Now copy `gdir/tools/accounts-manager/main.go` to `gdir-accounts/main.go`. And under `gdir-accounts` run:

```
go run main.go --key <KEY> --in ../path/to/AutoRclone/accounts
git add .
git commit --amend --no-edit --allow-empty-message
git push -f
```

It will read all your Service Accounts generated with AutoRclone, encrypt them with your `KEY` and store them in your Gist repository.

Then copy `gdir/tools/users-manager/main.go` to `gdir-users/main.go`. And under `gdir-users` run:

```
go run main.go --key <KEY> --user admin --pass <password>
go run main.go --key <KEY> --user user1 --pass <password> --drive-white-list <DRIVE1,DRIVE2>
go run main.go --key <KEY> --user user2 --pass <password> --drive-black-list <DRIVE3,DRIVE4>
git add .
git commit --amend --no-edit --allow-empty-message
git push -f
```

This will create 3 users: `admin` with all access, `user1` with only access to `DRIVE1` and `DRIVE2`, and `user2` with all access but `DRIVE3` and `DRIVE4`. And it will also encrypt the users info and store them in your Gist repository.

Finally, deploy your Cloudflare Worker with the `gdir/dist/worker.js` file.
