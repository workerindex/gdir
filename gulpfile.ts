import rmfr from 'rmfr';
import sass from 'gulp-sass';
import * as gulp from 'gulp';
import { rollup, RollupOptions, OutputOptions } from 'rollup';
import { series, parallel, watch } from 'gulp';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescriptPlugin from '@rollup/plugin-typescript';

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
            file: './dist/app.js',
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
    gulp.src('./app/styles/**/*.scss').pipe(sass().on('error', sass.logError)).pipe(gulp.dest('./dist')),
);

gulp.task('app.static', () => gulp.src(['./app/**/*.html', './app/favicon.ico']).pipe(gulp.dest('./dist')));

gulp.task('worker.rollup', async () => {
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
    const output: OutputOptions = {
        file: './dist/worker.js',
        format: 'iife',
        sourcemap: true,
    };

    const bundle = await rollup(input);
    await bundle.write(output);
});

gulp.task('clean', async () => rmfr('./dist'));

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
            gulp.src('./dist').pipe(
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
