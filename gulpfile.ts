import fs from 'fs';
import rmfr from 'rmfr';
import glob from 'glob';
import sass from 'gulp-sass';
import * as gulp from 'gulp';
import { rollup, RollupOptions, OutputOptions } from 'rollup';
import { series, parallel, watch } from 'gulp';
import replace from '@rollup/plugin-replace';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescriptPlugin from '@rollup/plugin-typescript';

const config = require('./config');
const webserver = require('gulp-webserver');
const Cloudworker = require('@dollarshaveclub/cloudworker');

const workerServerConfig = {
    port: 3000,
    host: '0.0.0.0',
    debug: true,
};

const staticServerConfig = {
    port: 3005,
    host: '127.0.0.1',
};

gulp.task('app.rollup', async () => {
    const input: RollupOptions = {
        input: './app/index.tsx',
        external: ['react', 'react-dom', 'react-router-dom'],
        plugins: [
            resolve({
                extensions: ['.js', '.ts', '.tsx'],
            }),
            commonjs({
                include: 'node_modules/**',
                extensions: ['.js', '.ts'],
            }),
            typescriptPlugin({
                tsconfig: './app/tsconfig.json',
            }),
        ],
    };
    const output: RollupOptions = {
        output: {
            file: './static/app.js',
            format: 'iife',
            sourcemap: true,
            globals: {
                rxjs: 'rxjs',
                react: 'React',
                'react-dom': 'ReactDOM',
                'react-router-dom': 'ReactRouterDOM',
            },
        },
    };

    const bundle = await rollup(input);
    await bundle.write(output);
});

gulp.task('app.scss', () =>
    gulp.src('./app/styles/**/*.scss').pipe(sass().on('error', sass.logError)).pipe(gulp.dest('./static')),
);

gulp.task('app.static', () => gulp.src(['./app/**/*.html', './app/favicon.ico']).pipe(gulp.dest('./static')));

gulp.task('worker.rollup', async () => {
    if (!config.accountsURL) {
        config.accountsURL = `https://gist.githubusercontent.com/${config.gist_user}/${config.gist_id.accounts}/raw/`;
    }
    if (!config.usersURL) {
        config.usersURL = `https://gist.githubusercontent.com/${config.gist_user}/${config.gist_id.users}/raw/`;
    }
    if (!config.staticURL) {
        config.staticURL = `https://gist.githubusercontent.com/${config.gist_user}/${config.gist_id.static}/raw`;
    }
    const input: RollupOptions = {
        input: './worker/index.ts',
        plugins: [
            replace({
                __SECRET__: config.secret_key,
                'length: 1000': `length: ${config.accounts_count}`,
                'accountRotation: 60': `accountRotation: ${config.account_rotation}`,
                'accountCandidates: 10': `accountCandidates: ${config.account_candidates}`,
                __ACCOUNTS_URL__: config.accountsURL,
                __USERS_URL__: config.usersURL,
                __STATIC_URL__: config.staticURL,
                include: './worker/config.ts',
            }),
            resolve({
                extensions: ['.js', '.ts'],
            }),
            commonjs({
                include: 'node_modules/**',
                extensions: ['.js', '.ts'],
            }),
            typescriptPlugin({
                tsconfig: './worker/tsconfig.json',
            }),
        ],
    };
    const output: OutputOptions = {
        file: './dist/worker.js',
        format: 'iife',
        sourcemap: true,
    };

    const bundle = await rollup(input);
    await bundle.write(output);
});

gulp.task('clean', async () => Promise.all([rmfr('./dist/*.*', { glob: {} }), rmfr('./static/*.*', { glob: {} })]));

gulp.task('default', series('clean', 'app.rollup', 'app.scss', 'app.static', 'worker.rollup'));

gulp.task('watch', () => {
    watch(['./app/**/*.ts', './app/**/*.tsx'], series('app.rollup'));
    watch('./app/**/*.scss', series('app.scss'));
    watch(['./app/**/*.html', './app/favicon.ico'], parallel('app.static', 'worker.rollup'));
});

gulp.task(
    'serve',
    series(
        async () => {
            config.accountsURL = `http://${staticServerConfig.host}:${staticServerConfig.port}/`;
            config.usersURL = `http://${staticServerConfig.host}:${staticServerConfig.port}/`;
            config.staticURL = `http://${staticServerConfig.host}:${staticServerConfig.port}`;
        },
        'default',
        parallel(
            'watch',
            async () => {
                const { port, host, debug } = workerServerConfig;
                let server: any = null;
                let reloading = false;
                const startServer = async () => {
                    if (server) {
                        if (!reloading) {
                            reloading = true;
                            console.log('\nReloading Worker Server...\n');
                            server.close(async () => {
                                server = null;
                                await startServer();
                                console.log('\nReloading Worker Server Success!\n');
                                reloading = false;
                            });
                        }
                        return;
                    }
                    server = new Cloudworker(fs.readFileSync('./dist/worker.js', 'utf-8'), {
                        debug,
                    }).listen(port, host);
                };
                await startServer();
                console.log(
                    '\n' + `Local Worker is live at: http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}/` + '\n',
                );
                watch('./worker/**/*.ts', series('worker.rollup', startServer));
            },
            () => gulp.src(['./accounts', './users', './static']).pipe(webserver(staticServerConfig)),
        ),
    ),
);
