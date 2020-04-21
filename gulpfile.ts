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
    const input: RollupOptions = {
        input: './worker/index.ts',
        plugins: [
            replace({
                __SECRET__: config.secret_key,
                'length: 1000': `length: ${config.accounts_count}`,
                'accountRotation: 60': `accountRotation: ${config.account_rotation}`,
                'accountCandidates: 10': `accountCandidates: ${config.account_candidates}`,
                __GIST_USER__: config.gist_user,
                __GISTHASH_FOR_ACCOUNTS__: config.gist_id.accounts,
                __GISTHASH_FOR_USERS__: config.gist_id.users,
                __GISTHASH_FOR_STATIC__: config.gist_id.static,
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
    watch('./worker/**/*.ts', series('worker.rollup'));
});

gulp.task(
    'serve',
    series(
        'default',
        parallel('watch', () =>
            gulp.src('./static').pipe(
                webserver({
                    port: '8000',
                    host: '127.0.0.1',
                    livereload: true,
                    fallback: 'index.html',
                }),
            ),
        ),
    ),
);
