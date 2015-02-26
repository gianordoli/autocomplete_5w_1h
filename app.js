var request = require('request'),
		 fs = require('fs'),
		 jf = require('jsonfile'),
	   util = require('util'),
	  iconv = require('iconv-lite'),
MongoClient = require('mongodb').MongoClient,
     format = require('util').format,
	CronJob = require('cron').CronJob
		  _ = require('underscore');

console.log('--------------------------------------------');
console.log('App started running');
console.log('--------------------------------------------');

var words = ['who+', 'what+', 'when+', 'where+', 'why+', 'how+'];
// console.log(words);

// All results from this day
var dailyResults = [];
var wordIndex = 0;

// new CronJob('0 0 2 * * *', function(){
	restart(true);
	// var now = new Date();
	// console.log(now.getHours() + ':' + now.getMinutes());
// }, null, true, 'UTC');


/*-------------------- MAIN FUNCTIONS --------------------*/

// This is used both to START (1st time) and RESTART the calls
// Latter might be due to:
// a) Finished scraping a given country
// (in that case, it wouldn't be necessary to reset the variables...
// b) errorCount > 5, so skip to the next country
function restart(resetVars){
	if(resetVars){
		letterIndex = 0;
		serviceIndex = 0;		
	}
	dailyResults = [];
	callAutocomplete(words[wordIndex]);
}

function callAutocomplete(query){
	console.log('Called callAutocomplete.')

	var url = {
		uri: concatenateUrl(query),
		encoding: null
	};

	request(url, function (error, response, body) {
	// 	// console.log(error);
	// 	// console.log(response);
		// console.log(body);

		if (!error && response.statusCode == 200) {

			var data = JSON.parse(iconv.decode(body, 'ISO-8859-1'));
			// console.log(data);
			var suggestions = data[1];
			// console.log(suggestions);
			// console.log(suggestions.length);

			// Create a new record and store
			createRecord(query, suggestions, function(err, obj){
				if(!err){
					console.log(obj);	
					dailyResults.push(obj);						
				}
				// Call next iteration even if err == true
				// Might be the case that no suggestions were retrieved,
				// so just jump to the next letter
				nextIteration();				
			});
		}else{
			console.log(error);
		}
	});
}

/*-------------------- FUNCTIONS --------------------*/

function nextIteration(){

	// New word...
	wordIndex ++;
	if(wordIndex < words.length){
		// var msg = letters[letterIndex] + ', ';
		// saveLog(msg);
		// setTimeout(function(){	// Delay to prevent Google's shut down		
			callAutocomplete(letters[letterIndex], services[serviceIndex], countries[countryIndex]);
		// }, 500);
	
	}else{

		// New service...
		letterIndex = 0;
		serviceIndex ++;
		if (serviceIndex < services.length) {
			var msg = services[serviceIndex].site + ', ';
			saveLog(msg);
			// setTimeout(function(){	// Delay to prevent Google's shut down
				callAutocomplete(letters[letterIndex], services[serviceIndex], countries[countryIndex]);
			// }, 500);
	
		}else{
			
			// Save data / new country
			serviceIndex  = 0;
			countryIndex ++;
			var msg = '\nFinished scraping ' +
					  countries[countryIndex - 1].domain;
			saveLog(msg);
			console.log(msg);

			// Save JSON
			saveToJSON(countries[countryIndex - 1], function(err){

				if(!err){
					var msg = '\nSaved JSON file.';
					saveLog(msg);
					console.log(msg);

					// Save mongoDB
					saveToMongoDB(function(err){

						if(!err){
							var msg = '\nSaved to mongoDB.' +
									  '\n--------------------------------------------';
							saveLog(msg);
							console.log(msg);

							// New country
							if(countryIndex < countries.length){
								setTimeout(function(){
									restart(false);	// no need to reset letter and service
								}, 120000);
							}
						}
					});
				}
			});
		}
	}	
}

// Creates url for reqquest, concatenating the parameters
function concatenateUrl(query){
	console.log('Called concatenateUrl');
	// console.log(service.ds);	
	var requestUrl = 
					'https://www.google.com/complete/search?' +
					 '&client=firefox'+
					 '&q=' + query;

	// console.log(requestUrl);
	console.log('Returning ' + requestUrl);
	return requestUrl;
}

// Returns a record
function createRecord(query, suggestions, callback){
	console.log('Called createRecord');
	// console.log('Received:');
	// console.log(query);
	// console.log(suggestions);
	var obj;
	if(suggestions.length > 0){	
		obj = {
			date: new Date(),
			word: query.substring(0, query.length - 1),
			results: suggestions
			// results: suggestionToObj(service, suggestions)
		};
		// console.log('Returning ' + obj);
		callback(false, obj);
	}else{
		callback(true);	// err
	}
}

// Saves results to JSON file
function saveToJSON(country, callback){
	console.log('Saving data to JSON file.')
	var date = new Date();
	var timestamp = date.getTime();
	var domain = country.domain;
	while(domain.indexOf('.') > -1){
		domain = domain.replace('.', '_');
	}
	var file = 'db/data_'+domain+'_'+timestamp+'.json'
	var obj = dailyResults;
	 
	jf.writeFile(file, obj, function(err) {
	  // console.log(err);
	  if(!err){
	  	console.log('Results successfully saved at ' + file);
	  	callback(false);	// error = false
	  }else{
	  	console.log('Failed to save JSON file.');
	  }
	});
}

// Save results to mongoDB
function saveToMongoDB(callback){
	console.log('Saving data to mongoDB.')

	MongoClient.connect('mongodb://127.0.0.1:27017/autocomplete', function(err, db) {
		console.log('Connecting to DB...');
		if(err) throw err;
		console.log('Connected.');
		var collection = db.collection('records');
		var index = 0;
		insertObject(dailyResults[index]);

		function insertObject(obj){
			console.log('Called insertObject.');
			// console.log(obj);
			collection.insert(obj, function(err, docs) {
				if(err){
					throw err;
				}else{
					console.log('Obj succesfully saved to DB.');	
					// Next iteration
					if(index < dailyResults.length - 1){
						index++;
						var obj = dailyResults[index];
						insertObject(obj);					
					}else{
						db.close();			// close database						
						callback(false);	// err = false						
					}					
				}
			});
		}
	});
}