define(function (require) {
  var k4d3 = require('k4d3');
  var $ = require('jquery');
  var _ = require('lodash');
  var typeDefs = require('../saved_visualizations/_type_defs');


  require('css!../styles/visualization.css');

  var module = require('modules').get('kibana/directive');

  module.directive('visualize', function (createNotifier, SavedVis, indexPatterns) {
    return {
      restrict: 'E',
      scope : {
        vis: '=',
      },
      template: require('text!../partials/visualize.html'),
      link: function ($scope, $el) {
        var chart; // set in "vis" watcher

        var $visualize = $el.find('.visualize-chart');
        var $table = $el.find('.visualize-table');

        $scope.showTable = false;

        var buildFlattenedData = function () {
          if (!$scope.showTable) {
            delete $scope.flattenedData;
            return;
          }

          // clone chartData.raw so that we can replace the rows and columns
          $scope.flattenedData = _.clone($scope.chartData.raw);

          // flatten the fields to a list of strings
          $scope.flattenedData.columns = $scope.chartData.raw.columns.map(function (col) {
            return col.aggParams ? col.aggParams.field : 'count';
          });

          // collect the formats before itterating
          var formats = $scope.chartData.raw.columns.map(function (col) {
            return col.field ? col.field.format.convert : _.identity;
          });
          // format all of the row values
          $scope.flattenedData.rows = $scope.chartData.raw.rows.map(function (row) {
            return row.map(function (cell, i) {
              return formats[i](cell);
            });
          });
        };

        var render = function () {
          buildFlattenedData();
          if (chart && $scope.chartData && $visualize.is(':visible')) {
            chart.render($scope.chartData);
          }
        };

        $scope.$watch('vis', function (vis, prevVis) {
          if (prevVis && vis !== prevVis && prevVis.destroy) prevVis.destroy();
          if (chart) {
            chart.off('hover');
            chart.off('click');
            chart.destroy();
          }

          if (!vis) return;

          if (vis.error) {
            $el.html('<div class="visualize-error"><i class="fa fa-exclamation-triangle"></i><br>' + vis.error + '</div>');
            return;
          }

          var typeDefinition = typeDefs.byName[vis.typeName];
          var notify = createNotifier({ location: vis.title || vis.typeName + ' visualization' });
          var params = {
            type: vis.typeName,
          };

          _.merge(params, vis.params);
          _.defaults(params, typeDefinition.params);

          chart = new k4d3.Chart($visualize[0], params);

          // For each type of interaction, assign the the handler if the vis object has it
          // otherwise use the typeDef, otherwise, do nothing.
          _.each({hover: 'onHover', click: 'onClick', brush: 'onBrush'}, function (func, event) {
            var callback = vis[func] || typeDefinition[func];
            if (!!callback) chart.on(event, callback);
          });

          vis.searchSource.onResults(function onResults(resp) {
            $scope.chartData = vis.buildChartDataFromResponse(vis.searchSource.get('index'), resp);
            render();
          }).catch(notify.fatal);

          vis.searchSource.onError(notify.error);

          $scope.$root.$broadcast('ready:vis');
        });

        $scope.$watch('showTable', render);

        $scope.$on('resize', function () {
          var old;
          (function waitForAnim() {
            var cur = $el.width() + ':' + $el.height();
            if (cur !== old) {
              old = cur;
              // resize can sometimes be called before animations on the element are complete.
              // check each 50ms if the animations are complete and then render when they are
              return setTimeout(waitForAnim, 200);
            }

            // chart reference changes over time, don't bind to a specific chart object.
            if (chart) chart.resize();
          }());
        });

        $scope.$on('$destroy', function () {
          if ($scope.vis) $scope.vis.destroy();
          if (chart) {
            chart.off('hover');
            chart.off('click');
            chart.destroy();
          }
        });
      }
    };
  });
});