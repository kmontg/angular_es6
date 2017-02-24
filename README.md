# Build Your Own AngularJS in ES6

This repo is a port of the brilliant Build Your Own AngularJS code from https://github.com/teropa/build-your-own-angularjs
using ES6 features.

## Reasons for implementing in ES6
* Forces me to learn ES6 in the context of a framework
* More challenging than copying the code directly from the BYOAJS repo
* Still get to learn the internals of AngularJS (even though I'm a bit late to the party)

## Tips for Testing
When I first started this repo I was implementing the unit tests again in ES6. This was very tedious as I 
was hoping to get through the book in a few session. My workaround has been to integrate the unit test (ES5)
code from the main BYOAJS repo with my re-written code in the /src directory. To do this I set teropa's BYOAJS
repo as a remote (including tags) and can pull in unit-tests on a chapter by chapter basis with the following command:

```bash
git checkout tags/<chapter tag> -- test/*
```

The downside to my laziness in not wanting to modify the test code is that it relies on the CommonJS pattern
of module loading and I would ideally like to use ES6 modules. The current workaround is to translate the ES6 modules to
CommonJS but this requires adding the '.default' to each require statement in the ES5 tests (http://www.2ality.com/2015/12/babel-commonjs.html)
when the module is imported (less than ideal as each test file still needs to be modified slightly).

## Updates from Original BYOAJS Repo
* Updated to Phantomjs2 headless browser for testing
* Removed jshint in favour of eslint for automatic linting in VS code
* Utilized Babel and babel-preset-env to pull in polyfills for ES6 features not supported by PhantomJS (Symbols, etc.)

