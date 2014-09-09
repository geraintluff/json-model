module.exports = function (grunt) {

	grunt.loadNpmTasks('grunt-mocha-test');
	grunt.loadNpmTasks('grunt-concat-sourcemap');
	grunt.loadNpmTasks('grunt-contrib-uglify');

	grunt.initConfig({
		mochaTest: {
			any: {
				src: ['tests/**/*.js'],
				options: {
					reporter: 'mocha-unfunk-reporter',
					bail: false
				}
			}
		},
		concat_sourcemap: {
			options: {
				separator: '\n'
			},
			source: {
				expand: true,
				cwd: 'source',
				rename: function (dest, src) {
					return dest;
				},
				src: [
					'__header.js',
					'schema2js.js',
					'model.js',
					'model-bind.js',
					'__footer.js'
				],
				dest: 'json-model.js'
			}
		},
		uglify: {
			main: {
				options: {
					report: 'min',
					sourceMapIn: 'json-model.js.map',
					sourceMap: 'json-model.min.js.map'
				},
				files: {
					'json-model.min.js': ['json-model.js']
				}
			}
		}
	});
	
	grunt.registerTask('mdpages', function () {
		var mdpages = require('mdpages'), fs = require('fs');
		var markdown = fs.readFileSync(__dirname + '/README.md', {encoding: 'utf-8'});
		var html = mdpages.convertString(markdown);
		fs.writeFileSync(__dirname + '/index.html', html);
	});
	
	grunt.registerTask('version', function () {
		var fs = require('fs');
		var packageInfo = require('./package.json');
		var header = fs.readFileSync('./source/__header.js', {encoding: 'utf-8'});
		header = header.replace(/\/\*VERSION\*\/.*?\/\*\/VERSION\*\//, '/*VERSION*/' + JSON.stringify(packageInfo.version) + '/*/VERSION*/');
		fs.writeFileSync('./source/__header.js', header);
	})
	
	grunt.registerTask('compare', function () {
		var fs = require('fs'), path = require('path');

		var tests = [];
		var testFiles = ['type.json', 'properties.json', 'additionalProperties.json', 'required.json', 'maxProperties.json', 'minProperties.json', 'items.json', 'additionalItems.json', 'maxItems.json', 'minItems.json', 'pattern.json', 'maxLength.json', 'minLength.json', 'minimum.json', 'maximum.json', 'dependencies.json', 'allOf.json', 'anyOf.json', 'oneOf.json', 'ref.json'];
		testFiles.forEach(function (testFile) {
			var filename = path.join(__dirname, 'tests/json-schema-test-suite/tests/draft4', testFile);
			var testJson = fs.readFileSync(filename, {encoding: 'utf-8'});
			var testSet = JSON.parse(testJson);
			for (var i = 0; i < testSet.length; i++) {
				var testGroup = testSet[i];
				tests = tests.concat(testGroup.tests.map(function (test) {
					return {schema: testGroup.schema, data: test.data, valid: test.valid};
				}));
			}
		});
		

		/*******/

		var done = this.async();

		var comparison = require('./comparison/comparison.js');

		var JsonModel = require('./');
		JsonModel.bindings.includeDir('./bindings');
		var packageInfo = require('./package.json');
		JsonModel.version = packageInfo.version;
		var oldApi = require('json-model');
		var oldApiPackageInfo = require('json-model/package.json');
		oldApi.version = oldApiPackageInfo.version;

		var metaSchema4 = require('./tests/draft-04-schema.json');

		var knownSchemas = {};
		knownSchemas[metaSchema4.id] = metaSchema4;

		fs.writeFileSync(__dirname + '/comparison/tests.json', JSON.stringify(tests, null, '\t'));
		fs.writeFileSync(__dirname + '/comparison/known-schemas.json', JSON.stringify(knownSchemas, null, '\t'));
		console.log(tests.length + ' tests');
		comparison.runTests(tests, knownSchemas, function (error, results) {
		
			var readme = fs.readFileSync(__dirname + '/README.md', {encoding: 'utf-8'});
			readme.asyncReplace(/(<!--SPEEDSTART-->)([^]*)(<!--SPEEDEND-->)/g, function (match, start, middle, end, callback) {
				var model = JsonModel.create(results, null, 'tmp://comparison');
				var context = JsonModel.context;
				var html = model.html('table', {width: '100%'});
				context.expandHtml(html, function (error, html) {
					callback(error, start + '\n' + html  + '\n' + end);
				});
			}, function (error, readme) {
				if (error) throw error;
				fs.writeFileSync(__dirname + '/README.md', readme);
				done();
			});
		});
	});

	// main cli commands
	grunt.registerTask('default', ['test', 'compare', 'mdpages']);
	grunt.registerTask('test', ['version', 'concat_sourcemap', 'uglify', 'mochaTest']);

};