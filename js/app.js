// -------------------------   Global Vars and Initialize ----------------------- //
var debugmode = false;

$(document).ready(function() {
    init();
});

function init() {
    configureClicks();
    toggleSideBar();
    var options = {};
    options.service = "sysinfo";
    getDataSet(options);
}

function loadPackages() {
    var options = {};
    options.service = "packages";
    getDataSet(options);
}

// Click handlers //

function configureClicks() {
    $("#btnShowSettings").click(function(e) {
        showSettings();
    });
    
    $(document.body).on('click', '.package' ,function(){
        var options = {};
        options.package = $(this).attr("data-id");
        options.servce = "endpoints";
        getDataSet(options);
    });
    
    $("#btnRefresh").click(function(e) {
        loadPackages();
    });
    
    $("#btnSideBar").click(function(e) {
        toggleSideBar();
    });
}

// AJAX Call to backend //

function getDataSet(options) {
    showLoadingSpinner(true, "loading...");
    var jURL = "lib/data.xsjs";

    $.ajax({
        url: jURL,
        type: "GET",
        data: options,
        success: function(data) {
            if (options.service == "packages") {
                var arrPackages = new Array();
            	var objPackages = data.packages;
            	$("#packages").html("");
            	
            	$.each(objPackages, function( key, val ) {
            	    $("#packages").append("<li><a href='#' class='package' data-id='" + val.PACKAGES + "'>" + val.PACKAGES + " (" + val.CNT + ")</a></li>");
            	});
            } else if (options.service == "sysinfo") {
                $("#instanceid").html(data.sysinfo[0].VALUE);
                $("#instanceno").html(data.sysinfo[1].VALUE);
                $("#hanaversion").html(data.sysinfo[3].VALUE.split(" ")[0]);
                $("#osversion").html(data.sysinfo[4].VALUE.replace("SUSE Linux Enterprise Server", "SLES"));
                $("#startdate").html(data.sysinfo[5].VALUE.split(" ")[2]);
                $("#starttime").html(data.sysinfo[5].VALUE.split(" ")[1]);
                
                loadPackages();
            } else {
                var objEndPoints = data.endpoints;
                var arrEndpoints = Array();
        	   
        	    $.each(objEndPoints, function( key, val ) {
        		    arrEndpoints.push({url: val.URL});
        	    });
        		
        	    var createdQueryBuilder = new OData.explorer.DataExplorer(arrEndpoints);
            }
            showLoadingSpinner(false, ""); 
        },
        error: function(jqXHR, textStatus, errorThrown) {
            $("#content").html(jqXHR);
            showLoadingSpinner(false, "");
        }
    });
}

// Display nav menu, optional //

function toggleSideBar(bHide){
    if ($("#logoarea").css("display") === "block" || bHide) {
        $("#logoarea").css("display", "none");
        $("#main").css("margin-left", "0");
    } else {
        $("#logoarea").css("display", "block");
        $("#main").css("margin-left", "270px");
    }
}


// Display modal box, optional //

function showSettings() {
    $('#dialogHTML1').css('height', 'auto');
    $('#modaldlg').css('height', 'auto');
    $('#modaldlg').css('width', '720px');
    $('#myModal').appendTo("body").modal('show');
}


// Loading spinner //

function showLoadingSpinner(visible, strText){
    if (visible){
        $(".loading").css("display", "block");
        if (debugmode !== "hidden"){
            $("#loading-text").html(strText);
        }
    } else {
        $(".loading").css("display", "none");
    }
}

