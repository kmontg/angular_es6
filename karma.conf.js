module.exports = function(config) {
  config.set({
    frameworks: ['browserify', 'jasmine'],
    files: [
      'src/**/*.js',
      'test/**/*_spec.js'
    ],
    preprocessors: {
      'test/**/*.js': ['browserify'],
      'src/**/*.js': ['browserify']
    },
    browsers: ['PhantomJS2'],
    reporters: ['progress'],
    autoWatch: true,
    // when packaging the framework for use test/prod usage this will need to be put in package.json as well
    browserify: {
      debug: true,
      transform: [['babelify', {'comments': false}]],
      bundleDelay: 2000 // Fixes "reload" error messages, YMMV!
    }
  })
}