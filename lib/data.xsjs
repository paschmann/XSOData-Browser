var Dataset = new Object({});
var output = "";
var service = $.request.parameters.get('service');
var packageid = $.request.parameters.get('package');

if (service == "packages") {
    Dataset.packages = executeRecordSetObj("SELECT DISTINCT package_id AS packages, count(*) as cnt FROM _SYS_REPO.runtime_objects WHERE object_suffix = 'xsodatart' GROUP BY package_id");
} else if (service == "sysinfo") {
    Dataset.sysinfo = executeRecordSetObj("SELECT * FROM SYS.M_SYSTEM_OVERVIEW");
} else {
    Dataset.endpoints = executeRecordSetObj("select '/' || REPLACE(package_id, '.', '/') || '/' || object_name || '.xsodata' as url from _SYS_REPO.runtime_objects WHERE object_suffix = 'xsodatart' AND package_id = '" + packageid + "'");
}
output = JSON.stringify(Dataset);
$.response.contentType = "application/json";
$.response.setBody(output);

function executeRecordSetObj(strSQL){
	try {
		var conn = $.hdb.getConnection();
		//var pstmt = conn.prepareStatement(strSQL);
		var rs = conn.executeQuery(strSQL);
		conn.close();
		
		//return '[' + strObj.substring(0, strObj.length - 1) + ']';
		//return strObj.substring(0, strObj.length - 1);
		return rs;
	} catch (err) {
		return err.message;
	} 
}
