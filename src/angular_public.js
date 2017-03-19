import _ from 'lodash';
import setupModuleLoader from 'loader';
import filter from 'filter';
import parse from 'parse';
import scope from 'scope';
import {$QProvider, $$QProvider} from 'q';
import {$HttpProvider, $HttpParamSerializerJQLikeProvider, $HttpParamSerializerProvider} from 'http';
import httpBackend from 'http_backend';
import compile from 'compile';
import controller from 'controller';
import ngController from 'directives/ng_controller';

export default function publishExternalAPI() {
    setupModuleLoader(window);

    let ngModule = window.angular.module('ng', []);
    ngModule.provider('$filter', filter);
    ngModule.provider('$parse', parse);
    ngModule.provider('$rootScope', scope);
    ngModule.provider('$q', $QProvider);
    ngModule.provider('$$q', $$QProvider);
    ngModule.provider('$httpBackend', httpBackend);
    ngModule.provider('$http', $HttpProvider);
    ngModule.provider('$httpParamSerializer', $HttpParamSerializerProvider);
    ngModule.provider('$httpParamSerializerJQLike', $HttpParamSerializerJQLikeProvider);
    ngModule.provider('$compile', compile);
    ngModule.provider('$controller', controller);
    ngModule.directive('ngController', ngController);
}