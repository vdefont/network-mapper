var mysql = require('mysql');



// MySQL Connection and basic operations

// Performs mySQL query, calls callback function with result
function mySQLQuery(con,query,callback){
  con.query(query, function (err, result, fields) {
    if (err) {
      console.log("MySQL query error. Query: " + query + " Error: " + err);
      callback(0);
    }
    else callback(result);
  });
}

// Query MySQL server
// Calls callback function with params tableName, tableData
function mySQLGetTable(con, tableName, callback) {

  var orderBy = "";
  if (tableName in ["node","edge","instanceDate"]) var orderBy = " ORDER BY instanceNum";
  var query = `SELECT * FROM ${tableName}${orderBy}`;
  mySQLQuery(con,query,function(tableData){
    if (!tableData) tableData = []; // If query error, return no data
    callback(tableName,tableData);
  })
}

// Data is an array of value arrays
function mySQLInsert(con, tableName, data, callback) {
  // Turn data into list of values
  var valueStrLst = [];
  for (var i = 0; i < data.length; i++) {
    var curRow = data[i];
    var curValueStr = "(" + curRow.join(",") + ")";
    valueStrLst.push(curValueStr);
  }
  var valueStr = valueStrLst.join(",");

  // If no data, return immediately
  if (valueStr == "") callback();

  // If there is data, insert it
  else {
    var query = "REPLACE INTO " + tableName + " VALUES " + valueStr;
    mySQLQuery(con,query,callback);
  }
}

// Get max instance num
function mySQLGetMaxInstanceNum(con,callback){
  var query = `SELECT MAX(instanceNum) AS maxInstanceNum from instanceDate`;
  mySQLQuery(con,query,function(result){
    var maxInstanceNum = result[0]["maxInstanceNum"];
    callback(maxInstanceNum);
  });
}



// Get or insert all data

// Given: mySQL connection
// Calls callback function with tables dict as parameter
// Tables dict:
// - instanceDate
// - node
// - edge
function loadSQLTables(con,callback) {
  var tables = {};

  var numQueriesFinished = 0;
  var queryFinished = function(tableName,tableData){
    tables[tableName] = tableData;
    numQueriesFinished ++;
    if (numQueriesFinished == 5) callback(tables);
  };

  mySQLGetTable(con,"instanceDate",queryFinished);
  mySQLGetTable(con,"node",queryFinished);
  mySQLGetTable(con,"edge",queryFinished);
  mySQLGetTable(con,"emaInfo",queryFinished);
  mySQLGetTable(con,"routerProps",queryFinished);
}

function insertSQLTables(con,emaNum,nextInstanceNum,nodeTable,edgeTable,routerPropsTable,callback) {
  var numQueriesFinished = 0;
  var queryFinished = function(){
    numQueriesFinished ++;
    if (numQueriesFinished == 4) callback();
  }

  // Insert into nextInstance table
  var queryInstanceNum = `INSERT INTO instanceDate VALUES ("${nextInstanceNum}",NOW(),${emaNum})`;
  mySQLQuery(con,queryInstanceNum,queryFinished);

  // Insert into node and edge tables
  mySQLInsert(con,"node",nodeTable,queryFinished);
  mySQLInsert(con,"edge",edgeTable,queryFinished);
  mySQLInsert(con,"routerProps",routerPropsTable,queryFinished);
}



// Convert data format between table and dict

// Takes tables returned from mySQL and converts into node and edge dicts
// Ret allData{}:
// - instances: {} instanceNum -> {}: emaNum, date, nodeDict, edgeDict
// - propsDict: {} [emaNum,shortId] -> {}: name, longId, type, isEndpoint
// - emaInfo: {} emaNum -> buildingName
function parseSQLTables(instanceDateTable,nodeTable,edgeTable,emaInfoTable,routerPropsTable) {

  // Create skeleton of data
  var instances = {};
  for (var i = 0; i < instanceDateTable.length; i++) {
    var curRow = instanceDateTable[i];
    var curInstanceNum = curRow["instanceNum"];
    instances[curInstanceNum] = {};
    instances[curInstanceNum]["date"] = curRow["date"];
    instances[curInstanceNum]["emaNum"] = curRow["emaNum"];
    instances[curInstanceNum]["nodeDict"] = {};
    instances[curInstanceNum]["edgeDict"] = {};
  }

  // Add all nodes
  for (var i = 0; i < nodeTable.length; i++) {
    var curRow = nodeTable[i];
    var curInstanceNum = curRow["instanceNum"];
    var curLabel = curRow["label"];
    var curX = curRow["x"];
    var curY = curRow["y"];
    instances[curInstanceNum]["nodeDict"][curLabel] = [curX,curY];
  }

  // Add all edges
  for (var i = 0; i < edgeTable.length; i++) {
    var curEdge = edgeTable[i];
    var curInstanceNum = curEdge["instanceNum"];
    var curSrc = curEdge["src"];
    var curDst = curEdge["dst"];
    var curLqi = curEdge["lqi"];
    var curRssi = curEdge["rssi"];
    instances[curInstanceNum]["edgeDict"][[curSrc,curDst]] = curRssi;
  }

  // Add propsDict info
  var propsDict = {};
  for (var i = 0; i < routerPropsTable.length; i++) {
    var curRouter = routerPropsTable[i];
    var emaNum = curRouter["emaNum"];
    var shortId = curRouter["shortId"];
    var name = curRouter["name"];
    var longId = curRouter["longId"];
    var type = curRouter["type"];
    var isEndpoint = curRouter["isEndpoint"];
    var resetNum = curRouter["resetNum"];
    propsDict[[emaNum,shortId]] = {name:name,longId:longId,type:type,isEndpoint:isEndpoint,resetNum:resetNum};
  }

  // Add emaInfo
  var emaInfo = {buildingName:{},updateFreq:{}};
  for (var i = 0; i < emaInfoTable.length; i++) {
    var curRow = emaInfoTable[i];
    var emaNum = curRow["emaNum"];
    var buildingName = curRow["buildingName"];
    var updateFreq = curRow["updateFreq"];
    emaInfo.buildingName[emaNum] = buildingName;
    emaInfo.updateFreq[emaNum] = updateFreq;
  }

  var allData = {
    instances:instances,
    propsDict:propsDict,
    emaInfo:emaInfo
  };
  return allData;
}

// Make SQL tables for saving
// Return tables {}:
// - node -> node rows
// - edge -> edge rows
// - routerProps -> properties for all routers
function parseDictsToTables(emaNum,nextInstanceNum,nodeDict,edgeDict,propsDict,endpointIdArr){
  // Make node table
  var nodeTable = [];
  for (var label in nodeDict) {
    var pos = nodeDict[label];
    var x = pos[0];
    var y = pos[1];
    label = '"' + label + '"';  // Quotes for SQL insertion
    nodeTable.push([nextInstanceNum,label,x,y]);
  }

  // Make edge table
  var edgeTable = [];
  for (var edgeStr in edgeDict) {
    var edge = edgeStr.split(",");
    var srcNode = edge[0];
    var src = '"' + edge[0] + '"';  // Quotes for SQL insertion
    var dst = '"' + edge[1] + '"';  // Quotes for SQL insertion
    var lqi = edgeDict[edge];
    var rssiExists = (srcNode in propsDict.rssi);
    if (srcNode in propsDict.rssi) var rssi = propsDict.rssi[srcNode];
    else var rssi = "null";
    edgeTable.push([nextInstanceNum,src,dst,lqi,rssi]);
  }

  // Make routerPropsTable
  var routerPropsTable = [];
  for (var shortId in propsDict["longId"]) {
    var name = '"' + propsDict["name"][shortId] + '"';
    var longId = '"' + propsDict["longId"][shortId] + '"';
    var type = '"' + propsDict["type"][shortId] + '"';
    var isEndpoint = (endpointIdArr.indexOf(shortId) > -1) ? 1 : 0;
    if (shortId in propsDict.resetNum) var resetNum = propsDict.resetNum[shortId];
    else var resetNum = "null";
    var instanceNumUpdated = nextInstanceNum;
    routerPropsTable.push([emaNum,name,'"' + shortId + '"',longId,type,isEndpoint,resetNum,instanceNumUpdated]);
  }

  // Return tables
  var tables = {};
  tables["node"] = nodeTable;
  tables["edge"] = edgeTable;
  tables["routerProps"] = routerPropsTable;
  return tables;
}



// Top-level load and save functions

// Connect to mySQL and load tables
// Calls callback with params:
// - allData
function loadData(con,callback){
  loadSQLTables(con, function(tables){
    // Parse SQL tables into the proper format
    var instanceDateTable = tables["instanceDate"];
    var nodeTable = tables["node"];
    var edgeTable = tables["edge"];
    var emaInfoTable = tables["emaInfo"];
    var routerPropsTable = tables["routerProps"];
    var allData = parseSQLTables(instanceDateTable,nodeTable,edgeTable,emaInfoTable,routerPropsTable);
    callback(allData);
  });
}

// Saves the new instance, as well as the node dict and edge dict
function saveData(con,emaNum,maxInstanceNum,nodeDict,edgeDict,propsDict,endpointIdArr,callback) {
  var nextInstanceNum = maxInstanceNum + 1;
  var tables = parseDictsToTables(emaNum,nextInstanceNum,nodeDict,edgeDict,propsDict,endpointIdArr);
  var nodeTable = tables["node"];
  var edgeTable = tables["edge"];
  var routerPropsTable = tables["routerProps"];

  insertSQLTables(con,emaNum,nextInstanceNum,nodeTable,edgeTable,routerPropsTable,callback);
}



// Functions to export

function save(connection,emaNum,nodeDict,edgeDict,propsDict,endpointIdArr,callback){
  mySQLGetMaxInstanceNum(connection,function(maxInstanceNum){
    saveData(connection,emaNum,maxInstanceNum,nodeDict,edgeDict,propsDict,endpointIdArr,function(){
      callback("success");
    });
  });
}

// Returns allData as param to callback
function load(connection,callback) {
  loadData(connection,function(allData){
    callback(allData);
  });
}

function changeFreq(connection,emaNum,freq,callback) {
  var query = `UPDATE emaInfo SET updateFreq="${freq}" WHERE emaNum="${emaNum}"`;
  mySQLQuery(connection,query,function(){
    callback();
  });
}

// Get IP addresses of all EMAs
function getEmaIpAddr(connection,emaNum,callback) {
  var query = `SELECT ipAddr FROM emaInfo WHERE emaNum=${emaNum}`;
  mySQLQuery(connection,query,function(result){
    var ipAddr = result[0].ipAddr;
    callback(ipAddr);
  })
}

function addEma(connection,emaNum,ipAddr,buildingName,callback) {
  var query = `REPLACE INTO emaInfo (emaNum,ipAddr,buildingName,updateFreq) VALUES (${emaNum},"${ipAddr}","${buildingName}",0)`;
  mySQLQuery(connection,query,function(){
    callback();
  })
}

// Export load and save functions
module.exports = {
  save:save,
  load:load,
  changeFreq:changeFreq,
  addEma:addEma,
  getEmaIpAddr:getEmaIpAddr
}
