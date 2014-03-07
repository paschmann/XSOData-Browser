/*************************************************************************************************************************************
This class acts as a SJAX helper between the calling page (html) and the XSJS file
**************************************************************************************************************************************/


function HanaTalk (schema, fileurl){
    /*************************************************************************************************************************************
	Class Declaration/Variables
	**************************************************************************************************************************************/
	
	this.schema = schema;
	
    this.fileurl = typeof fileurl === 'undefined' ? 'scripts/server.xsjs' : fileurl;
	
	/*************************************************************************************************************************************
	Constants
	**************************************************************************************************************************************/
	
	this.RECORDSET = 'executeRecordSet';
	this.RECORDSETOBJ = 'executeRecordSetObj';
	this.SCALAR = 'executeScalar';
	this.CHANGE = 'executeChange';
	
	
	/*************************************************************************************************************************************
	Mehtods/Functions
	**************************************************************************************************************************************/
	
    this.executeRecordSet = function(sql){
        return this.execute (this.RECORDSET, sql, this.fileurl);
    }
    
    this.executeRecordSetObj = function(sql){
        return this.execute (this.RECORDSETOBJ, sql, this.fileurl);
    }
    
    this.executeScalar = function(sql){
       return this.execute (this.SCALAR, sql, this.fileurl);
    }
    
    this.executeChange = function(sql){
        return this.execute (this.CHANGE, sql, this.fileurl);
    }
    
	this.execute = function(operation, sql){
		var resp = '';
				
		var jURL = this.fileurl + '?operation=' + operation 
			+ '&sql=' + sql 
			+ '&schema=' + this.schema;
			
		jQuery.ajax({
			url:jURL,
			async: false,
            //dataType: 'jsonp',
			success: function(data) {
				resp = data;
			},
                error : function(jqXHR, textStatus, errorThrown) {
                	resp = jqXHR.responseText;
           	}
		});
		return resp;
	}
	
	
	
	
}


