import _ from 'lodash';

import filterFilter from 'filter_filter';

let filters = {};

function register(name, factory) {
    if (_.isObject(name)) {
        return _.map(name, function(factory, name) {
            return register(name, factory);
        })
    } else {
        let filter = factory();
        filters[name] = filter;
        return filter;
    } 
}

function filter(name) {
    return filters[name];
}

register('filter', filterFilter);

export {register, filter};