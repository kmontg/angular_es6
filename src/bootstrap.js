import $ from 'jquery';
import _ from 'lodash';
import publishExternalAPI from 'angular_public';
import createInjector from 'injector';

publishExternalAPI();
export default function bootstrap(element, modules, config) {
    let $element = $(element);
    modules = modules || [];
    config = config || {};
    modules.unshift(['$provide', ($provide) => {
        $provide.value('$rootElement', $element);
    }]);
    modules.unshift('ng');
    let injector = createInjector(modules, config.strictDi);
    $element.data('$injector', injector);
    injector.invoke(['$compile', '$rootScope', ($compile, $rootScope) => {
        $rootScope.$apply(() => {
            $compile($element)($rootScope);
        });
    }]);
    return injector;
}


window.angular.bootstrap = bootstrap;

let ngAttrPrefixes = ['ng-', 'data-ng-', 'ng:', 'x-ng-'];

$(document).ready(() => {
    let foundAppElement, foundModule, config = {};
    _.forEach(ngAttrPrefixes, (prefix) => {
        let attrName = prefix + 'app';
        let selector = '[' + attrName.replace(':', '\\:') + ']';
        let element;
        if (!foundAppElement && (element = document.querySelector(selector))) {
            foundAppElement = element;
            foundModule = element.getAttribute(attrName);
        }
    });
    if (foundAppElement) {
        config.strictDi = _.some(ngAttrPrefixes, (prefix) => {
            let attrName = prefix + 'strict-di';
            return foundAppElement.hasAttribute(attrName);
        });
        window.angular.bootstrap(
            foundAppElement,
            foundModule ? [foundModule] : [],
            config
        );
    }
});