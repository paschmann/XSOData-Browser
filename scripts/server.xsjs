/*************************************************************************************************************************************
Main Function
**************************************************************************************************************************************/

var operation =     $.request.parameters.get('operation');
var sql = 			$.request.parameters.get('sql');
var schema = 		$.request.parameters.get('schema');

var conn = $.db.getConnection();

if (schema != ''){
	conn.prepareStatement('SET SCHEMA "' + schema + '"').execute(); 
}

var pstmt = conn.prepareStatement(sql);
var output = '';

switch (operation){
case 'executeScalar':
	output = executeScalar();
	break;
case 'executeChange':
	output = executeChange();
	break;
case 'executeRecordSet':
	output = executeRecordSet();
	break;
case 'executeRecordSetObj':
	output = executeRecordSetObj();
	break;
default:
	output = 'Unknown operation type';
}

$.response.contentType = "plain/text";
$.response.setBody(output);


/*************************************************************************************************************************************
Functions/Methods
**************************************************************************************************************************************/


function executeChange(){
	try{
    	var updateCount = pstmt.executeUpdate();
    	conn.commit();
	} catch (err) {
		updateCount = $.net.http.INTERNAL_SERVER_ERROR;
	} finally {
		pstmt.close();
		return updateCount;
	}
}

function executeScalar(){
	try{
		var rs = pstmt.executeQuery();
		var retVal = '';
			
		if (!rs.next()) {
			retVal = '';
			retval = $.net.http.INTERNAL_SERVER_ERROR;
		} else {
			retVal = rs.getString(1);
		}
   } catch (err) {
		retVal = $.net.http.INTERNAL_SERVER_ERROR;
	} finally {
		rs.close();
		pstmt.close();
		return retVal;
	}
}

function executeRecordSet(){
	try{
		var rs = pstmt.executeQuery();
		var rsm = rs.getMetaData();
		var intCount = 0;
		var htmlTable = '';
		
		htmlTable += '<table><tr>';
		
		for (var i = 1; i <= rsm.getColumnCount(); i++){
			htmlTable += '<th align=\'left\'>' + rsm.getColumnName(i) + '</th>';
		}
		
		htmlTable += '</tr>';
		while (rs.next()) {
			htmlTable += '<tr>';
			for (var i = 1; i <= rsm.getColumnCount(); i++){
				htmlTable += '<td>';
				htmlTable += rs.getString(i);
				htmlTable += '</td>';
			}
			htmlTable += '</tr>';
		}
		htmlTable += '</table>';
    
    } catch (err) {
		htmlTable = $.net.http.INTERNAL_SERVER_ERROR;
	} finally {
		rs.close();
		pstmt.close();
		return htmlTable;
	}
}

function executeRecordSetObj(){
	try{
		var rs = pstmt.executeQuery();
		var rsm = rs.getMetaData();
		var strObj = '';
		
		while (rs.next()) {
			strObj += '{';
			for (var i = 1; i <= rsm.getColumnCount(); i++){
				strObj += '"' + rsm.getColumnLabel(i) + '":"' + rs.getString(i) + '",';
			}
			strObj = strObj.substring(0, strObj.length - 1);
			strObj += '},'
		}
		
		strObj = '[' + strObj.substring(0, strObj.length - 1) + ']';
		
	} catch (err) {
		strObj = $.net.http.INTERNAL_SERVER_ERROR;
	} finally {
		rs.close();
		pstmt.close();
		return strObj;
	}
}


