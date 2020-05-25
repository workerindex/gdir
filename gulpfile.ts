import fs from 'fs';
import rmfr from 'rmfr';
import sass from 'gulp-sass';
import * as gulp from 'gulp';
import { rollup, RollupOptions, OutputOptions } from 'rollup';
import { series, parallel, watch } from 'gulp';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescriptPlugin from '@rollup/plugin-typescript';

const workerServerConfig = {
    port: 3000,
    host: '0.0.0.0',
    debug: true,
};

const staticServerConfig = {
    port: 3005,
    host: '127.0.0.1',
    fallback: 'index.html',
};

gulp.task('app.rollup', async () => {
    const input: RollupOptions = {
        input: './app/index.tsx',
        external: ['react', 'react-dom', 'react-router-dom', 'rxjs', 'rxjs/ajax', 'rxjs/operators'],
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
                react: 'React',
                'react-dom': 'ReactDOM',
                'react-router-dom': 'ReactRouterDOM',
                rxjs: 'rxjs',
                'rxjs/ajax': 'rxjs.ajax',
                'rxjs/operators': 'rxjs.operators',
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
    const output: OutputOptions = {
        file: './dist/worker.js',
        format: 'iife',
        sourcemap: true,
    };
    const input: RollupOptions = {
        input: './worker/index.ts',
        plugins: [
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
    const bundle = await rollup(input);
    await bundle.write(output);
});

gulp.task('worker.config', async () => {});

gulp.task('clean', async () => Promise.all([rmfr('./dist/*.*', { glob: {} }), rmfr('./static/*.*', { glob: {} })]));

gulp.task('dist', series('clean', 'app.rollup', 'app.scss', 'app.static', 'worker.rollup'));

gulp.task('default', series('clean', 'app.rollup', 'app.scss', 'app.static', 'worker.rollup'));

gulp.task('watch', () => {
    watch(['./app/**/*.ts', './app/**/*.tsx'], series('app.rollup'));
    watch('./app/**/*.scss', series('app.scss'));
    watch(['./app/**/*.html', './app/favicon.ico'], parallel('app.static', 'worker.rollup'));
});

gulp.task(
    'serve',
    series(
        'default',
        parallel(
            'watch',
            async () => {
                const Cloudworker = require('@dollarshaveclub/cloudworker');
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
                    const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
                    const script = fs
                        .readFileSync('./dist/worker.js', 'utf-8')
                        .replace('__SECRET__', `${config.secret_key}`)
                        .replace('__ACCOUNTS_COUNT__', `${config.accounts_count}`)
                        .replace('__ACCOUNT_ROTATION__', `${config.account_rotation}`)
                        .replace('__ACCOUNT_CANDIDATES__', `${config.account_candidates}`)
                        .replace('__USERS_URL__', `http://${staticServerConfig.host}:${staticServerConfig.port}/`)
                        .replace('__STATIC_URL__', `http://${staticServerConfig.host}:${staticServerConfig.port}`)
                        .replace('__ACCOUNTS_URL__', `http://${staticServerConfig.host}:${staticServerConfig.port}/`);
                    server = new Cloudworker(script, { debug }).listen(port, host);
                };
                await startServer();
                console.log(
                    '\n' + `Local Worker is live at: http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}/` + '\n',
                );
                watch('./worker/**/*.ts', series('worker.rollup', startServer));
            },
            async () => {
                const webserver = require('gulp-webserver');
                return gulp.src(['./accounts', './users', './static']).pipe(webserver(staticServerConfig));
            },
        ),
    ),
);
