import _ from 'lodash';

import filterFilter from 'filter_filter';

export default function $FilterProvider($provide) {

    let filters = {};

    this.register = function (name, factory) {
        if (_.isObject(name)) {
            return _.map(name, (factory, name) => {
                return this.register(name, factory);
            });
        } else {
            return $provide.factory(name + 'Filter', factory);
        } 
    };

    this.$get = ['$injector', function($injector) {
        return function filter(name) {
            return $injector.get(name + 'Filter');
        };
    }];

    $FilterProvider.$inject = ['$provide'];

    this.register('filter', filterFilter);
}