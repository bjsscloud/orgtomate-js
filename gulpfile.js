#!/usr/bin/env node
// vim: set syntax=typescript tabstop=2 softtabstop=2 shiftwidth=2 expandtab smarttab :

'use strict';

const { version } = require('./package.json');

const chmod = require('gulp-chmod');
const del = require('del');
const eslint = require('gulp-eslint');
const gulp = require('gulp');
const gulpDebug = require('gulp-debug');
const gulpIf = require('gulp-if');
const gzip = require('gulp-gzip');
const log = require('fancy-log');
const rename = require('gulp-rename');
const markedMan = require('gulp-marked-man');
const sourcemaps = require('gulp-sourcemaps');
const typedoc = require('gulp-typedoc');
const typescript = require('gulp-typescript');
const uglify = require('gulp-uglify');

const tsProject = typescript.createProject('./src/tsconfig.json');

const paths = {
  ghconfig: ['src/docs/_config.yml'],
  scripts: ['src/**/*.ts'],
  dest: 'dist',
  sourcemaps: '.',
  docs: 'docs',
};

gulp.task('clean-docs', () => {
  return del([`${paths.docs}/*`]);
});

gulp.task('clean-dest', () => {
  return del([paths.dest]);
});

gulp.task('clean', gulp.parallel('clean-docs', 'clean-dest'));

gulp.task('ghconfig', () => {
  return gulp.src(paths.ghconfig)
    .pipe(gulp.dest(paths.docs))
});

gulp.task('typedoc', () => {
  return gulp.src(paths.scripts).pipe(
    typedoc({
      name: 'Orgtomate',
      tsconfig: 'src/tsconfig.json',
      out: 'docs/',
    }),
  );
});

gulp.task('marked-man', () => {
  return gulp.src('./src/docs/org.1.md')
  .pipe(markedMan())
  .pipe(gzip({ append: true }))
  .pipe(gulp.dest('./dist/man/'));
});

gulp.task('test', () => {
  return gulp
    .src(paths.scripts)
    .pipe(eslint())
    .pipe(eslint.formatEach())
    .pipe(eslint.failAfterError())
});

gulp.task('compile', () => {
  return gulp
    .src(paths.scripts)
    .pipe(sourcemaps.init())
    .pipe(tsProject())
    .pipe(gulpIf('*.js', uglify()))
    .pipe(
      gulpIf(
        '*.js',
        chmod({
          owner: {
            read: true,
            write: true,
            execute: true,
          },
          group: {
            execute: true,
          },
          others: {
            execute: true,
          },
        }),
      ),
    )
    .pipe(sourcemaps.write(paths.sourcemaps))
    .pipe(gulp.dest(paths.dest));
  // .pipe(gulpDebug({title: 'after dest:'}))
});

gulp.task('doc', gulp.series('test', 'clean-docs', gulp.parallel('typedoc', 'ghconfig')));
gulp.task('build', gulp.series('test', 'clean-dest', gulp.parallel('compile', 'marked-man')));
gulp.task('build-all', gulp.series('test', 'clean', gulp.parallel('typedoc', 'ghconfig', 'marked-man', 'compile')));
gulp.task('default', gulp.series('build'));
