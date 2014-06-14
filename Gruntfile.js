module.exports = function (grunt) {

	grunt.loadNpmTasks('grunt-mocha-test');

	grunt.initConfig({
		mochaTest: {
			any: {
				src: ['tests/**/*.js'],
				options: {
					reporter: 'mocha-unfunk-reporter',
					bail: false
				}
			}
		}
	});

	// main cli commands
	grunt.registerTask('default', ['test']);
	grunt.registerTask('test', ['mochaTest']);

};