var request = require('request'),
		 fs = require('fs'),
		 jf = require('jsonfile'),
	   util = require('util'),
	  iconv = require('iconv-lite'),
MongoClient = require('mongodb').MongoClient,
     format = require('util').format,
    CronJob = require('cron').CronJob;

console.log('--------------------------------------------');
console.log('App started running');
console.log('--------------------------------------------');

var words = ['who+', 'what+', 'when+', 'where+', 'why+', 'how+'];
// console.log(words);

// All results from this day
var dailyResults = [];
var wordIndex = 0;
var isRunning = false;

console.log(new Date());

new CronJob('* 00 15 * * *', function(){
	// console.log(new Date());
	if(!isRunning){
		callAutocomplete(words[wordIndex]);
		isRunning = true;		
	}
}, null, true, 'UTC');

/*-------------------- MAIN FUNCTIONS --------------------*/

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
		// console.log(words[wordIndex]);
		setTimeout(function(){	// Delay to prevent Google's shut down		
			callAutocomplete(words[wordIndex]);
		}, 15000);
	
	}else{

		// Save JSON
		saveToJSON(dailyResults, function(err){

			if(!err){
				var msg = '\nSaved JSON file.';
				console.log(msg);

				// Save mongoDB
				saveToMongoDB(function(err){

					if(!err){
						var msg = '\nSaved to mongoDB.' +
								  '\n--------------------------------------------';
						console.log(msg);

						isRunning = false;
					}
				});
			}
		});

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
		var now = new Date();
		now.setHours(0);
		now.setMinutes(0);
		now.setSeconds(0);
		now.setMilliseconds(0);

		obj = {
			date: now,
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
function saveToJSON(obj, callback){
	console.log('Saving data to JSON file.')
	var date = new Date();
	var timestamp = date.getTime();
	var file = 'db/data_'+timestamp+'.json'
	 
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

	MongoClient.connect('mongodb://127.0.0.1:27017/5w_1h', function(err, db) {
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