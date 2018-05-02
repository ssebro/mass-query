var REQUEST_LIMIT = 1;

var queryResultData = [];
var csvHeaders = {};

(function init(){
    localStorage.getItem("BearerToken") && (document.getElementById("inputBearerToken").value = localStorage.getItem("BearerToken"));
    localStorage.getItem("TargetedUrl") && (document.getElementById("inputTargetedUrl").value = localStorage.getItem("TargetedUrl"));
})();

function handleCSVInputFile() {

    var doneFetching = false;
    var totalRows = 0;
    var totalFetched = 0;
    var files = document.getElementById("myFile").files;
    var activelyFetching = 0;
    var pauseCalled = false;
    Papa.parse(files[0],
        {
            header: true,
            step: function (results, parser) {

                if (activelyFetching >= REQUEST_LIMIT) {
                    pauseCalled = true;
                    parser.pause();
                }
                activelyFetching++;
                totalRows++;
                useCsvRowToQueryTargetUrl(results.data[0], function rateLimitDecrementer() {
                    activelyFetching--;

                    totalFetched++;

                    if (activelyFetching == REQUEST_LIMIT && pauseCalled) {
                        pauseCalled = false;
                        parser.resume();
                    }

                    if (doneFetching && (totalRows == totalFetched)) {
                        writeFinalCSV();
                        alert('Fetched data for all ' + totalFetched + ' rows.');
                    }
                });

            },
            error: function (err, file) {
                alert(JSON.stringify(err));
            },
            complete: function () {
                doneFetching = true;
            }
        });
}

function extractHeaders(obj) {
    var keys = Object.keys(obj);
    keys.forEach(function (key) {
        csvHeaders[key] = true;
    })
}

/*
Transforms
[
    {
        "Column 1": "foo",
        "Column 3": "bar"
    },
    {
        "Column 1": "abc",
        "Column 2": "def",
    }
]

Into 
{
	fields: ["Column 1", "Column 2", "Column 3"],
	data: [
		["foo", "", "bar"],
		["abc", "def", ""]
	]
}
*/

function extractCSVDataStructure(allHeaders, rowData) {
    var output = {};
    output.fields = Object.keys(allHeaders);
    output.data = [];

    rowData.forEach(function (rowDatum) {
        var rowAsArray = [];
        output.fields.forEach(function (header) {
            if (!rowDatum[header]) {
                rowDatum[header] = "";
            }
            rowAsArray.push(rowDatum[header]);
        })
        output.data.push(rowAsArray);
    })
    return output;
}

function extractLegacyJSONAPIData(response, primaryKey) {
    var type = Object.keys(response)[0];
    var emptyResult = {};
    emptyResult[primaryKey] = csvRow[primaryKey];
    var normalizedResult = flattenObject(response[type][0] || emptyResult);
    queryResultData.push(normalizedResult);
    extractHeaders(normalizedResult);
}

function isLegacyJSONApi(response, primaryKey) {
    return !response.data;
}
function extractJSONAPIData(response, primaryKey, csvRow) {

    var type = Object.keys(response)[0];
    var emptyResult = {};
    emptyResult[primaryKey] = csvRow[primaryKey];
    response.data.attributes && (response.data.attributes[primaryKey] = csvRow[primaryKey]);
    var normalizedResult = flattenObject(response.data.attributes || emptyResult);
    queryResultData.push(normalizedResult);
    extractHeaders(normalizedResult);
}

function extractData(response, primaryKey, csvRow) {
    if (isLegacyJSONApi(response)) {
        extractLegacyJSONAPIData(response, primaryKey, csvRow);
    } else {
        extractJSONAPIData(response, primaryKey, csvRow);
    }
}

function useCsvRowToQueryTargetUrl(csvRow, cb) {
    var targetUrl = getTargetedUrl();

    var primaryKey = Object.keys(csvRow)[0];
    var generatedTargetUrl = targetUrl + '?' + primaryKey + "=" + csvRow[primaryKey];
    getUrl(generatedTargetUrl, function (response) {

        delete response.links;
        extractData(response, primaryKey, csvRow);
        cb();

    }, function (errorMsg) {
        alert(errorMsg);
    });

};


function flattenObject(target, opts) {
    opts = opts || {}

    var delimiter = opts.delimiter || '.'
    var maxDepth = opts.maxDepth
    var output = {}

    function step(object, prev, currentDepth) {
        currentDepth = currentDepth || 1
        Object.keys(object).forEach(function (key) {
            var value = object[key]
            var isarray = opts.safe && Array.isArray(value)
            var type = Object.prototype.toString.call(value)
            var isobject = (
                type === '[object Object]' ||
                type === '[object Array]'
            )

            var newKey = prev
                ? prev + delimiter + key
                : key

            if (!isarray && isobject && Object.keys(value).length &&
                (!opts.maxDepth || currentDepth < maxDepth)) {
                return step(value, newKey, currentDepth + 1)
            }

            output[newKey] = value
        })
    }

    step(target)
    return output
}

function resetDataStructures() {
    queryResultData = [];
    csvHeaders = {};
    document.getElementById('fileUploadContainer').innerHTML = '<input type="file" id="myFile" onchange="handleCSVInputFile()">';
}

function writeFinalCSV() {
    var requiredCSVDataStructure = extractCSVDataStructure(csvHeaders, queryResultData);
    var csvData = Papa.unparse((requiredCSVDataStructure));
    var blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);

    var link = document.createElement('a');
    link.href = url;
    link.download = "Bulk Query Output.csv";
    link.click();
    resetDataStructures();
}
function getBearerToken() {
    var token = document.getElementById("inputBearerToken").value;
    token && localStorage.setItem('BearerToken', token);
    return token;
}
function getTargetedUrl() {
    var targetedUrl = document.getElementById("inputTargetedUrl").value;
    targetedUrl && localStorage.setItem('TargetedUrl', targetedUrl);
    return targetedUrl;
}
//--Simple ajax get helper
function getUrl(url, cb, failCb) {
    var bearerToken = getBearerToken();
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Authorization', bearerToken);

    xhr.send();

    function processRequest(e) {
        if (xhr.readyState == 4 && xhr.status == 200) {
            var response = JSON.parse(xhr.responseText);
            cb(response);
        } else if (xhr.readyState == 4) {
            failCb(xhr.responseText);
        }
    }
    xhr.onreadystatechange = processRequest;
}