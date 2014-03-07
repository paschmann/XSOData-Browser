var Dataset = new Object({});
var output = "";

Dataset.endpoints = executeRecordSetObj("select '/' || REPLACE(package_id, '.', '/') || '/' || object_name as url from _SYS_REPO.runtime_objects where object_suffix = 'xsodatart'");
output = JSON.stringify(Dataset);
$.response.contentType = "text/html";
$.response.setBody(output);

function executeRecordSetObj(strSQL){
	try {
		var conn = $.db.getConnection();
		var pstmt = conn.prepareStatement(strSQL);
		var rs = pstmt.executeQuery();
		var rsm = rs.getMetaData();
		var strObj = '';
		
		while (rs.next()) {
		    strObj += '{';
			for (var i = 1; i <= rsm.getColumnCount(); i++){
				strObj += '"' + rsm.getColumnLabel(i).toLowerCase() + '":"' + rs.getString(i) + '",';
			}
			strObj = strObj.substring(0, strObj.length - 1);
			strObj += '},';
		}
		
		rs.close();
		pstmt.close();
		conn.close();
		
		//return '[' + strObj.substring(0, strObj.length - 1) + ']';
		return strObj.substring(0, strObj.length - 1);
	} catch (err) {
		return err.message;
	}
}
