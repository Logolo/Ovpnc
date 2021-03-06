/*
 *
 * OpenVPN Controller JS lib
 *
 */
"use strict";

// Declare global log function
var log = function ( msg, obj ){
    obj === undefined ? console.log(msg) : console.log(msg, obj);
};

var dump = function (obj){
    console.log("Dump: %o",obj);
};

/* Declare Ovpnc namespace */
(function ($) {

    var mem, config, actions = {};

    //
    // Create name space $.Ovpnc
    //
    $.Ovpnc = function (options) {
        var obj = $.extend({},
        mem, actions, config, options);
        return obj;
    };

    //
    // Global items
    //
    $.Ovpnc._serverInterval = '';
    $.Ovpnc.ajaxLock = 0;
    $.Ovpnc.userData = new Object();

    //
    // Ovpnc static items
    //
    mem = {
        ajaxLoaderFloating: '<div id="ajaxLoaderFloating" onClick="$.Ovpnc().removeAjaxLoading()">&nbsp;</div>',
        ajaxLoader: '<img class="ajaxLoader" src="/static/images/ajax-loader.gif" />',
        okayIcon:   '<img class="ok_icon" width=16 height=16 src="/static/images/okay_icon.png" />',
        errorIcon:  '<img class="err_icon" width=16 height=16 src="/static/images/error_icon.png" />',
        alertIcon:  '<div class="err_text" style="margin:-1px 1.5px 0 1.5px"><img width=16 height=16 src="/static/images/alert_icon.png" /></div><div class="err_text">',
        alertOk:    '<div class="err_text" style="margin:-1px 1.5px 0 1.5px"><img width=16 height=16 style="margin-top:-2px" src="/static/images/okay_icon.png" /></div><div class="err_text">',
        alertErr:   '<div class="err_text" style="margin:-1px 1.5px 0 1.5px"><img width=16 height=16 style="margin-top:-2px" src="/static/images/error_icon.png" /></div><div class="err_text">',
        alertInfo:  '<div class="err_text" style="margin:-1px 1.5px 0 1.5px"><img width=16 height=16 style="margin-top:-2px" src="/static/images/info_icon.png" /></div><div class="err_text">'
    };
    //
    // Ovnpc config items
    //
    config = {
        // Get server status from api every n milliseconds
        opacityEffectDuration: 3000,
        // Sets the timing of the opacity fadein/out effect
        pathname: window.location.pathname,
        geoUsername: function() {
            return $('#geoUsername').attr('name');
        },
    };
    //
    // Ovpnc's js actions
    //
    actions = {
        //
        // Set debug if requested in URL
        //
        setDebug: function () {
            if ( getURLParameter('debug') !== undefined ){
                window.DEBUG = 1;
                log('Set debug to on');
            }
        },
        //
        // Get server status loop
        //
        pollStatus: function () {
            // run first query to status
            // before starting the setInterval
            $.Ovpnc().getServerStatus();

            // Then loop every n miliseconds
            $.Ovpnc._serverInterval = setInterval(function() {
                $.Ovpnc().getServerStatus();
            },
            ( window.pollFreq || 20000 ) );
        },
        //
        // Confirmation dialog
        //
        confirmDiag: function (p) {
            if ( window.DEBUG ) log ( "confirmDiag got: %o",p );
            if ( p.run_before ) p.run_before();
            var cDiv = document.createElement('div');
            $( cDiv ).css({
                'display':'none',
                'color'  :'#555555'
            });
            $( 'body' ).prepend( cDiv );
            $( cDiv ).attr('id','confirmDialog')
                    .dialog({
                 autoOpen: false,
                 title: p.title ? p.title : "Confirm action",
                 hide: "explode",
                 modal:true,
                 closeText: 'close',
                 closeOnEscape: true,
                 stack: true,
                 height: p.height || "auto",
                 width: p.width || "auto",
                 zIndex:9010,
                 position: [ getMousePosition().x, getMousePosition().y ],
                 buttons: p.buttons ? p.buttons : [
                    { text: "cancel", click: function () { $(this).dialog("close").remove(); return false;} },
                    { text: "ok",     click: function () { $(this).dialog("close"); p.action( p.params );return true; } }
                 ],
            });
            $('#confirmDialog').dialog('open')
                               .html('<span>' + p.message + '</span>')
                               .show(200);
            $('.ui-dialog').addClass('justShadow');
            if ( p.run_after ) p.run_after();
            return false;
        },
        //
        // Check for existance of Root CA
        //
        checkRootCAExistance: function (){
            $.Ovpnc().ajaxCall({
                url: "/api/certificates",
                data: {
                    cert_name: 'check_any',
                    type: 'server',
                    name: 'anyuser'
                },
                method: 'GET',
                success_func: $.Ovpnc().ajaxCheckCASuccess,
                error_func: $.Ovpnc().ajaxCheckCAError
            });
        },
        //
        // Handle return of checkRootCAExistance
        //
        ajaxCheckCASuccess: function (r) {
            if ( window.DEBUG ) log("ajaxCheckCASuccess got: %o",r);
            var msg = jQuery.parseJSON(r.responseText);
            var _fountText = 0;
            // Avoid duplicate messages
            // If user already alerted
            // apply shake effect to msg div
            if ( $('#message_container').is(':hidden') ){
                $('#message_container').show(300);
            }
            $.each( $('.message_content').find('.err_text'), function(){
                if ( window.DEBUG ) log("found text: " + $(this).text() );
                if ( $(this).text().match(/You must have both a Root CA and a server certificate before you can start up the server/) ){
                    _fountText++;
                }
            });
            if ( _fountText == 0 ) {
                alert( $.Ovpnc().alertErr + ' You must have both a Root CA and a server certificate before you can start up the server.</div><div class="clear"></div>' );
            }
            else {
                $('#message_container').effect("shake", { times:3, distance: 3 }, 500);
            }
            return false;
        },
        //
        // Handle error return of checkRootCAExistance
        //
        ajaxCheckCAError: function (e) {
            if ( window.DEBUG ) log("ajaxCheckCAError got: %o",e);
            var msg = jQuery.parseJSON(e.responseText);
            if ( msg.rest.status !== undefined
              && msg.rest.status === 'Certificate exists'
            ){
                var cmd = 'start';
                if ( window.DEBUG ) log("Root CA status:" + msg.rest.error);
                $.Ovpnc().ajaxCall({
                    url: "/api/server/",
                    data: { command: cmd },
                    method: 'POST',
                    success_func: function successAjaxServerControl(r,cmd){ return $.Ovpnc().successAjaxServerControl( r, cmd ) },
                    error_func: function errorAjaxServerControl(r,cmd){ return $.Ovpnc().errorAjaxServerControl( r, cmd ) },
                    loader: 1,
                    timeout: 15000
                });
                return true;
            }
        },
        //
        // Data return from client action
        //
        returnedClientData: function (r){
            if ( window.DEBUG ) log( "returnedClientData got: %o" , r);
            // Expect one field
            if ( r.rest.resultset !== undefined
              && r.rest.field !== undefined
              && r.rest.resultset.length > 0
            ){
                $('input#' + r.rest.field).parent('div').prepend('<span class="error_message error_constraint_required">' + r.rest.field + ' already exists</span>');
                $('input#' + r.rest.field).parent('div').find('label').css('color','#8B0000');
            }
        },
        //
        // Used by pages having flexigrid table
        //
        styleFlexigrid: function () {

            // Select/Unselect all (Ctrl a or u)
            var isCtrl = false;
            $(document).keyup(function (e) {
                if (e.which == 17) isCtrl = false;
            }).keydown(function (e) {
                if (e.which == 17) isCtrl = true;
                if ( isCtrl == true ){
                    if ( e.which == 65 ){
                        $('.bDiv').find('tr').addClass('trSelected');
                        return false;
                    }
                    else if ( e.which == 85 ){
                        $('.bDiv').find('tr').removeClass('trSelected');
                        return false;
                    }
                    return true;
                }
            });

            $.Ovpnc().chooseUser({
                element: $('.qsbox'),
                like: 1,
                rows: 18,
                suggestionsUpwards: 1,
                field: function () { return $('.sDiv2').find('select').val().toLowerCase() },
                //no_return_all: 1,
                min_length: 1,
                db: window.location.pathname === '/clients' ? 'user' : window.location.pathname  
            });

            // Show ajax loader before data
            // loads up from ajax call
            $('.bDiv').append('<div id="ajaxLoaderFlexgridLoading">Loading table data... <img src="/static/images/ajax-loader.gif" /></div>');
            // Style the select boxes of flexigrid
            //$('.sDiv2, .pGroup').find('select').css({
            //    '-moz-border-radius': '5px',
            //    'border-radius': '5px',
            //    'padding': '2px',
            //    'border': '1px inset #CCCCCC'
            //});
            // Force show the hGrip
            $('.hGrip').css('height', $('.flexigrid').height() +'px');
            // Move the selectAll and unSelectAll to the right
            $('.flexigrid').find('.tDiv2').css('float','none');
            $('.flexigrid').find('.fbutton').find('.selectAll, .unSelectAll')
                           .parent('div').parent('.fbutton').css('float','right');
            $('.flexigrid').find('.fbutton').find('.selectAll, .unSelectAll').css('padding-left','15px');

            var menuElements = [ 'Clients', 'Certificates', 'Logs', 'Configuration', 'Settings', 'Control' ];

            $('.ftitle').addClass('top_menu_titles')
                        .attr('id','certificates')
                        .css('text-shadow','1px 1px #CCCCCC');
            var currentMenu         = $.Ovpnc().pathname.replace('/',''),
                currentMenuElement  = $('.ftitle');
            	
            $('.ftitle').remove();
            for ( var i in menuElements ){
                if ( menuElements[i].toLowerCase() !== currentMenu ){
                    var fDiv = document.createElement('div');
                    $( fDiv ).addClass('ftitle top_menu_titles')
                             .attr('id', menuElements[i].toLowerCase())
                             .text(menuElements[i])
                             .css('font-weight','normal');
                    if ( menuElements[i].toLowerCase() === 'control' ){
                        $( fDiv ).css({
                            'float':'right',
                            'margin':'9px 10px 0 0',
                            'padding': '0',
                            'border': '0'
                        });
                    }
                    $('.mDiv').append( fDiv );
                }
                else {
                    $( currentMenuElement ).css({
                        'text-shadow':'1px 1px #CCCCCC',
                        'font-weight':'bold'
                    }).attr('id', menuElements[i].toLowerCase());
                    $('.mDiv').append( currentMenuElement );
                }
            }                    
            $('.mDiv').css({
                'display': '-moz-box',
                '-moz-box-align': 'center',
                'height': '40px',
                'text-align': 'center'
            });
            
            var on_off = $('#on_off_click_area');
            $('#on_off_click_area').remove();
            $('#control').html(on_off);
            if ($('#on_off_click_area').hasClass('hand_pointer')) {
                $('#on_off_click_area').click(function() {
                    $.Ovpnc().serverOnOff();
                });
            }
            $(on_off).css('padding','4px').show();
            $('.top_menu_titles')
            .hover(function(){
                if ( $(this).attr('id') !== currentMenu.toLowerCase()
                  && $(this).attr('id') !== 'control'
                ){
                    $(this).css({
                        'text-shadow':'1px 1px #CCCCCC',
                        'border':'1px solid #CCCCCC'
                    });
                }
            }, function(){
                if ( $(this).attr('id') !== currentMenu.toLowerCase()
                  && $(this).attr('id') !== 'control'
                ){
                    $(this).css({
                        'text-shadow':'none',
                        'border':'1px dotted #DDDDDD'
                    });
                }
            })
            .click(function(){
            	if ( $(this).attr('id') !== 'control' ) {
            		window.location.href=$(this).attr('id');
            	}
            });
        },
        //
        // Confirm leaving page
        //
        setConfirmExit: function(modified, action){
            if ( modified === undefined || modified === 0 ) {
                // On window unload
                if ( window.DEBUG ) log('Form modified, setting provided action.');
                window.onbeforeunload = action;
            }
            return 1;
        },
        //
        // Get Username from API
        //
        chooseUser: function(p){
            $( p.element ).autocomplete({
                source: function( request, response ){
                    // Exec ajax call
                    $.ajaxSetup({ async: true, cache: false, timeout: 5000 });
                    $.getJSON('/api/clients', {
                        search: request.term ? request.term : '_O_O_O_',
                        field: p.field ? p.field() : 'username',
                        like: p.like ? 1 : undefined,
                        rows: p.rows ? p.rows : undefined,
                        no_return_all: p.no_return_all ? 1 : undefined,
                        db: p.db ? p.db : window.location.pathname
                    },
                    function( result ) {
                        if ( result.rest === undefined ){
                            return false;
                        }
                        if ( Object.prototype.toString.call( result.rest.resultset ) !== '[object Array]' ){
                            response({ value: result.rest.resultset });
                            return;
                        }
                        else if ( result.rest.resultset !== undefined
                          && Object.prototype.toString.call( result.rest.resultset ) === '[object Array]'
                          && result.rest.resultset.length > 0
                        ){
                            response( $.map( result.rest.resultset, function ( item ) {
                                return {
                                    label: item,
                                    value: item
                                }
                            }));
                        }
                    }).error(function(xhr, ajaxOptions, thrownError) {
                        dump(xhr);log("error: " + xhr.responseText);
                    }).complete(function(){
                        $.ajaxSetup({ async: true, cache: false });
                        $(p.element).removeClass('ui-autocomplete-loading');
                    });
                },  
                //position: { my : "top top", at: "top top" },
                minLength: p.min_length ? p.min_length : 0,
            });
          
            $( p.element ).on("autocompleteopen", function(event, ui){
            	jQuery(".ui-autocomplete").css('font-size','0.75em');
            	if ( p.suggestionsUpwards !== undefined ){
            		$.Ovpnc().positionSuggestionsList(p.element);
            	}
            });
            
        },
        //
        // position suggestions of autocomplete
        //
        positionSuggestionsList: function (element){
            var oldTop = jQuery(".ui-autocomplete").offset().top;
            var newTop = oldTop - jQuery(".ui-autocomplete").height() - jQuery('.ui-autocomplete-input').height() - 14;
            jQuery(".ui-autocomplete").css("top", newTop);
        },
        //
        // Process a resultset returned from the api
        //
        processAjaxReturn: function ( msg, data_types, err ) {
            if ( msg.resultset !== undefined ) {
                if ( window.DEBUG ) log("msg.resultset: %o", msg.resultset );
                $.each( msg.resultset, function(item, data) {
                    if ( Object.prototype.toString.call(item) !== '[object String]' ){
                        $.each ( data, function( indx, obj ){
                            $.each( data_types, function(type, icon) {
                                if ( obj[type] !== undefined ){
                                    for ( var i in obj[type] ){
                                        alert( icon + ' ' + indx + ': ' + obj[type][i] + '</div><div class="clear"></div>' );
                                    }
                                }
                            });
                        });
                    }
                    else {
                        $.each( data_types, function(type, icon) {
                            if ( data[type] !== undefined ){
                                for ( var i in data[type] ){
                                    alert( icon + ' ' + item + ': ' + data[type][i] + '</div><div class="clear"></div>' );
                                }
                            }
                        });
                    }
                });
            }
            else {
                if ( window.DEBUG ) log("No msg.resultset!");
                alert( data[errors] + ' ' + msg + '</div><div class="clear"></div>' );
                return false;
            }
            if ( err !== undefined ){
                for ( var i in err ){
                    alert( $.Ovpnc().alertErr + ' ' + err[i] + '</div><div class="clear"></div>' );
                }
            }
        },
        //
        // Check the username from database
        //
        checkUsername: function(success_func, error_func){
            var _name = $('input#username').attr('value');
            if ( _name === undefined || _name == '' ) return;
            if ( window.DEBUG ) log( 'Going to check username: ' + _name );
            //( url, data, method, success_func, error_func, loader, timeout, retries, cache )
            $.Ovpnc().ajaxCall({
                url: '/api/clients',
                data: { field: 'username', search: _name,  no_return_all: 1 },
                method: 'GET',
                db: 'user',
                rows: 12,
                success_func: success_func ? success_func : $.Ovpnc().returnedClientData,
                error_func: error_func ? error_func : $.Ovpnc().errorAjaxReturn
            });
        },
        //
        // Check if the passwords match
        //
        checkPasswords: function(){
            var current = $('input#password2').attr('value');
            var first = $('input#password').attr('value');
            $.Ovpnc().verifyPasswordsMatch( first, current, 'password2' );
        },
        //
        // Check if this email is in use
        //
        checkEmail: function(){
            var _name = $('input#email').attr('value');
            if ( _name === undefined || _name == '' ) return;
            $.Ovpnc().ajaxCall({
                url: '/api/clients',
                data: { field: 'email', search: _name, no_return_all: 1 },
                method: 'GET',                
                success_func: $.Ovpnc().returnedClientData,
                error_func: $.Ovpnc().errorAjaxReturn
            });
        },
        //
        // Server status returns error
        //
        errorServerStatus: function(e){
            if ( window.DEBUG ) log("Server status error: %o", e);
            if ( e.responseText !== undefined
                && e.responseText !== null
                && e.responseText != ''
            ){
                var _msg = jQuery.parseJSON(e.responseText);
                if ( _msg !== undefined && _msg.error !== undefined ){
                    // Redirec to logout if session expired
                    if ( _msg.error === 'Session expired' ) {
                        alert($.Ovpnc().alertIcon + ' ' + _msg.error + ', redirecting to logout...</div><div class="clear"></div>');
                        var _wait_logout = setInterval(function() {
                                window.clearInterval(_wait_logout);
                                window.location = '/login';
                            }, 3000 );
                    }
                    alert($.Ovpnc().alertIcon + ' ' + _msg.error + '.</div><div class="clear"></div>');
                } else if ( _msg.rest !== undefined && _msg.rest.error !== undefined ){
                    alert($.Ovpnc().alertErr + ' ' + _msg.rest.error + '.</div><div class="clear"></div>');
                } else {
                    alert($.Ovpnc().alertErr + ' Unknown result from server! Ovpnc server might be down.</div><div class="clear"></div>');
                }
            }
            //else {
            //    alert($.Ovpnc().alertErr + ' Unknown result from backend! Ovpnc server might be down.</div><div class="clear"></div>');
            //}
        },
        //
        // Get server status
        //
        getServerStatus: function() {
            $.Ovpnc().ajaxCall({
                url: "/api/server/status",
                data: {},
                method: 'GET',
                success_func: $.Ovpnc().updateServerStatus,
                error_func: $.Ovpnc().errorServerStatus
            });
        },
        //
        // Server control call
        //
        serverAjaxControl: function(cmd) {
            if ( cmd === 'start' ){
                $.Ovpnc().checkRootCAExistance();
                return;
            }
            else {
                $.Ovpnc().ajaxCall({
                    url: "/api/server/",
                    data: { command: cmd },
                    method: 'POST',
                    success_func: function successAjaxServerControl(r,cmd){ return $.Ovpnc().successAjaxServerControl( r, cmd ) },
                    error_func: function errorAjaxServerControl(r,cmd){ return $.Ovpnc().errorAjaxServerControl( r, cmd ) },
                    loader: 1,
                    timeout: 10000
                });
            }
        },
        //
        // Server control success
        //
        successAjaxServerControl: function(r,cmd){
            if (r !== undefined && r.rest !== undefined) {
                r.status = new Object();
                r.status = r.rest.status;
                // Check returned /started/
                if (r.status.match(/started/)) {
                    alert($.Ovpnc().alertOk + ' ' + r.status + '.</div><div class="clear"></div>');
                    $('#on_icon').animate({
                        opacity: 1
                    },
                    $.Ovpnc().opacityEffectDuration);
                }
                // Check returned /stopped/
                else if (r.status.match(/stopped/)) {
                    alert($.Ovpnc().alertOk + ' Server stopped.</div><div class="clear"></div>');
                    $('#on_icon').animate({
                            opacity: 0
                        },
                        $.Ovpnc().opacityEffectDuration);

                    if ($('#client_status_container').is(':visible'))
                        $('#client_status_container').hide(300).empty();
                } else {
                    alert($.Ovpnc().alertErr + ' Server did not stop? ' + r.status + '</div><div class="clear"></div>');
                    return
                }
                $.Ovpnc().getServerStatus();
            }
            else {
                alert( $.Ovpnc().alertErr + ' Server control did not reply to action ' + cmd + '</div><div class="clear"></div>' );
                return false;
            }
        },
        //
        // Server control error
        //
        errorAjaxServerControl : function(r) {
            if ( window.DEBUG ) log( "errorAjaxServerControl: %o", r);
            r = r.responseText !== undefined ? jQuery.parseJSON(r.responseText) : r;
            r = ( r.rest && r.rest.error !== undefined ) ? r.rest.error : r;
            alert( $.Ovpnc().alertErr + ' Error executing command: ' + r + '</div><div class="clear"></div>' );
            return false;
        },
        //
        // Verify password inputs match
        //
        verifyPasswordsMatch: function(first, current, f_input){
            if ( window.DEBUG ) log('Got ' + first + ' to match to ' + current );
            if ( current === undefined || current == '' || first == '' ) return true;
            if ( current !== first ){
                if ( window.DEBUG ) log( 'No match' );
                $('#'+f_input).parent('div')
                    .prepend('<span class="passwd_err error_message error_constraint_required">Passwords do not match</span>');
                $('#'+f_input).parent('div').find('label').css('color','#8B0000');
                return false;
            }
            return true;
        },
        //
        // Set processing overlay div and ajax loader
        //
        setAjaxLoading: function(no_overlay,append_text){            
            $('body').prepend( $.Ovpnc().ajaxLoaderFloating );
            if ( append_text !== undefined
              && append_text.match(/\w+/)
            ){
                if ( window.DEBUG ) log ( 'Got append_text for ajaxLoader: ' + append_text );
                $('#ajaxLoaderFloating').append('<div id="loaderText">' + append_text + '</div>');
                $('#loaderText').slideDown(350);
            }
            if ( no_overlay !== undefined )
                $.Ovpnc().applyOverlay();
        },
        //
        // Remove overlay div and ajax loader
        //
        removeAjaxLoading: function(){
            $('#oDiv').fadeOut('slow').remove();
            $('#ajaxLoaderFloating').remove();
        },
        //
        // Apply div overlay
        //
        applyOverlay: function(){
            var oDiv = document.createElement('div');
            $( oDiv ).css({
                zIndex:         '9002',
                display:        'none',
                position:       'absolute',
                top:            '0px',
                opacity:        '0.4',
                'min-width':    '100%',
                'height':       '100%',
                'background-color': '#777777'
            }).attr('id', 'oDiv');
            $('#outer').prepend( oDiv );
            $( oDiv ).fadeIn(500);
        },
        //
        // Generate password click event handler
        //
        generatePasswordClick: function(){
            var _token = $('#token').attr('value');
            var _pass = $.Ovpnc().generatePassword(_token);
            // Clean any previous messages
            $('#password2').parent('div').find('span.error_message').empty();
            // Color the elements black, if it was
            // red because of previous error..
            $('#password2').parent('div').find('label').css('color','#000000');
            $('#generated_password_text').text(_pass);
            $('#password').attr('value', _pass );
            $('#password2').attr('value', _pass );
            return;
        },
        //
        // Generate random password
        //
        generatePassword: function(a){
            var m = new MersenneTwister();
            var randomNumber = m.random();
            var chars = randomNumber + "abcdefhjmnpqrstuvwxyz23456789ABCDEFGHJKLMNPQRSTUVWYXZ" + a;
            var _str = '';
            for (var i=0 ; i<16 ; i++ ){
                var _rn = Math.floor( Math.random() * chars.length );
                _str += chars.substring(_rn, _rn + 1);
            }
            return _str;
        },
        //
        // Init click events
        //
        clickBinds: function() {
            /*
             * Only if hand_pointer was assigned
             * via template, this user has
             * rights to control. In any case
             * user cannot call api functions
             * to which he doesnt have rights for.
             */
            if ($('#on_off_click_area').hasClass('hand_pointer')) {
                $('#on_off_click_area').click(function() {
                    $.Ovpnc().serverOnOff();
                });
            }
        },
        //
        // Get json data generic function
        //  ( url, data, method, success_func, error_func, loader, timeout, retries, cache, async )
        //
        ajaxCall: function(p){
            return jQuery.ajax({
                headers: { 'Accept' : 'application/json' },
                async: p.async ? p.async : true,
                timeout: p.timeout ? p.timeout : 5000,
                data: p.data ? p.data : {},
                type: p.method ? p.method : 'GET',
                tryCount: 0,
                retryLimit: p.retries ? p.retries : 3,
                cache: p.cache ? p.cache : false,
                url: p.url,
                beforeSend: function() {
                    $.Ovpnc.ajaxLock = 1;
                    if ( p.loader !== undefined )
                        $.Ovpnc().setAjaxLoading(1);
                },
                complete: p.complete_func ? function(rest) { return p.complete_func(rest); } : function(rest) {
                    $.Ovpnc.ajaxLock = 0;
                    if ( p.loader !== undefined )
                        $.Ovpnc().removeAjaxLoading();
                },
                success: p.success_func ? function(rest){ return p.success_func(rest); } : function(rest) {
                    if ( window.DEBUG ) log("Ajax got back: %o", rest);
                },
                error: p.error_func ? function(rest,xhr,throwError){ return p.error_func(rest,xhr,throwError); } : function(xhr, ajaxOptions, thrownError) {
                    this.tryCount++;
                    if (this.tryCount <= this.retryLimit) {
                        //try again
                        $.ajax(this);
                        return;
                    }
                    if ($(".client_div").is(":visible")) $(".client_div").hide(250);
                    $('#client_status_container').html("<div id='no_data'>" + "No data recieved, possible error: " + thrownError.toString() + "</div>").show(250);
                    return false;
                }
            });
        },
        //
        // process error message
        //
        process_err: function(e, m) {
            if (m === undefined) return false;
            var msg = jQuery.parseJSON(m);
            // In order for updateServerStatus to accept
            // the data structure and display the status
            // becaue this returned not as status 200
            // we are handling an error.
            var obj = new Object();
            obj.rest = new Object();
            if (msg.rest !== undefined) {
                $.each(msg.rest, function(k, v) {
                    if (k == "error" && v == "Server offline") {
                        obj.rest.status = v;
                        $.Ovpnc().updateServerStatus( obj );
						return;
                    }
                    else {
                        if ( window.DEBUG ) log( k + " -> " + v );
                        alert($.Ovpnc().alertOk + ' Error: ' + k + ' -> ' + v +'</div><div class="clear"></div>');
                    }
                });
            }
        },
        //
        // The version title of the server status div
        //
        populateVersion : function (version) {
            $('#server_status_content').attr('title', version ? version : '');
        },
        //
        // Update server status data
        //
        updateServerStatus: function(r) {
            if ( window.DEBUG ) log("%o",r);
            if (r !== undefined ) {
                // If we get status back, display
                if ( r.rest !== undefined && r.rest.status !== undefined) {
                    r.status = new Object();
                    r.status = r.rest.status; // Make "more" accessible
                    $('#server_status').text(r.status).css('color', r.status.match(/online/i) ? 'green' : 'gray');
                    // hand_pointer is only applied when this user
                    // has ACL to control the server. (in the tt2 template)
                    if ( $('#on_off_click_area').hasClass('hand_pointer') )
                        $('#on_off_click_area').attr('title', (r.status.match(/online/i) ? 'Shutdown' : 'Poweron') + ' OpenVPN server');
                    // reference used to determine status on click events
                    $('#serverOnOff').attr('ref', r.status.match(/online/i) ? 'on' : 'off');
                    // Show or dont show the green on icon
                    $('#on_icon').css('opacity', (r.status.match(/online/i) ? '1' : '0'));
                } else {
                    if ( window.DEBUG )  log("Server status got %o",r);
                }

                if ( r.rest !== undefined ){
                    // Show number of connected clients if any
                    $('#online_clients_number').text(r.rest.clients !== undefined ? r.rest.clients.length : 0);

                    // In the title of the server status
                    if (r.rest.title !== undefined) $.Ovpnc().populateVersion(r.rest.title);

                    // Update the table with any online clients data
                    // This applies only to path /clients

                    if (
                        //r.rest.clients !== undefined
                        //&&
                             $.Ovpnc().pathname === '/clients'
                        && $('#flexme').is(':visible')
                    ) {
                        if ( $.Ovpnc().pathname === '/clients' ){
                            $.Client().updateFlexgrid(r);
                        }
                    }
                }
            }
            return false;
        },
        //
        // The navigation menu
        //
        slide: function(nav_id, pad_out, pad_in, time, multiplier) {
            var li_elem = nav_id + " li.sliding-element";
            var links = li_elem + " a";
            // initiates the timer used
            // for the sliding animation
            var timer = 0;
            // Prevent animating more than once on entry
            if ($.cookie('Ovpnc_User_Settings') === null) {
                $.Ovpnc.userData = {
                    already_animated: 1
                };
                $.cookie("Ovpnc_User_Settings", JSON.stringify($.Ovpnc.userData), {
                    expires: 30,
                    path: '/'
                });
                // creates the slide animation for all list elements
                $(li_elem).each(function(i) {
                    // Remove earlier tab selections
                    $(this).css('font-weight', 'normal');
                    // margin left = - ([width of element] + [total vertical padding of element])
                    $(this).css("margin-left", "-180px");
                    // updates timer
                    timer = (timer * multiplier + time);
                    $(this).animate({
                        marginLeft: "0"
                    },
                    timer);
                    $(this).animate({
                        marginLeft: "15px"
                    },
                    timer);
                    $(this).animate({
                        marginLeft: "0"
                    },
                    timer);
                });
            }
            // creates the hover-slide
            // effect for all link elements
            $(links).each(function(i) {
                $(this).hover(
                function() {
                    $(this).animate({
                        paddingLeft: pad_out
                    },
                    150);
                },
                function() {
                    $(this).animate({
                        paddingLeft: pad_in
                    },
                    150);
                });
            });
            $.Ovpnc().setSelectTab(li_elem);
        },
        //
        // Control server on/off
        //
        serverOnOff: function() {
            // Turn off:
            if ( $('#serverOnOff').attr('ref') == 'on' ) {
                var _online = $('#online_clients_number').text(),
                    _cond   = "There " + (_online == 1 ? 'is ' : 'are ' ) + _online + ' client' +  ( _online > 1 ? 's ' : ' ' ) + 'online',
                    _action = function (){
                        $.Ovpnc().serverAjaxControl('stop');
                        // Wait 5 seconds to refresh the table
                        // Only on clients table page
                        if ( $('.flexigrid').is(':visible') ){
                            var _wait_refresh = setInterval(function() {
                                $('.pReload').click();
                                window.clearInterval(_wait_refresh);
                            }, 5000 );
                        }
                        return;
                    };

                if ( _online != 0 ) {
                    $.Ovpnc().confirmDiag({
                        message: '<div>' + $.Ovpnc().alertIcon + ' Warning!</div><br /></br /><div>' + _cond + '</div><div>Are you sure you want to turn the server off?</div>',
                        action: _action,
                        params: { button: '', grid: {}  },
                        width: '300px'
                    });
                }
                else {
                    _action();
                }
            } else {
                // Turn on:
                $.Ovpnc().serverAjaxControl('start');
                return;            
            }
        },
        //
        // Set the selected tab
        //
        setSelectTab: function(l) {
            // Check which page this is
            // then set text bolder on the selected
            var pathname = window.location.pathname;
            pathname = pathname.replace('/', '');
            if (pathname == '') {
                // This is main page
                $('a:contains("Main")').css('font-weight', 'bold');
            }
            else {
                $(l).each(function(i) {
                    var _curret_link = $(this).text().toLowerCase();
                    if (pathname.match(_curret_link)) {
                        $(this).css('font-weight', 'bold');
                        return;
                    }
                });
            }
        },
        //
        // Set the width of the middle frame
        //
        setMiddleFrameWidth: function(){
            var w = $(window).width();
            var f = w < 1300 ? ( 0.5 * w ) : ( 0.6 * w );
            var o;
            o = w < 1200 ? 7.5 : 10;
            o = w < 1100 ? 3 : 7.5;
            o = w < 1000 ? 0.5 : 3;
            var m = 3;
            $('#outer_centered').css('margin-left', o + '%');
            //if ( f > 601 )
                //$('#middle_frame').css('min-width', f + 'px');
            //if ( $('.flexigrid').is(':visible') ){
            //   $('.flexigrid').css('max-width', ( $('#middle_frame').width() - 40 ) + 'px' );
            //}
        }
    };

})(jQuery);

/*
 * Document Ready
 */
$(document).ready(function() {

    // Set debug if provided in url (debug=1)
    $.Ovpnc().setDebug();

    // Set width of middle frame
    //$.Ovpnc().setMiddleFrameWidth();
    //$(window).resize(function() {
    //    $.Ovpnc().setMiddleFrameWidth();
    //});

    // Exit on login page
    if ( window.location.pathname === '/login' )
        return false;
    
    // Set last visited page
    // Catalyst root controller
    // will do the redirecting
    var _pathname = '^' + window.location.origin + '(.*)$';
    var _came_from = '';
    if ( document.referrer != '' ){
        var re = new RegExp(_pathname);
        _came_from = document.referrer.replace( re , "$1" );
        if ( window.DEBUG ) log('Came from page: ' + _came_from);
        if ( _came_from !== window.location.pathname ){
            if ( window.DEBUG ) log("Setting last location: " + window.location.pathname + ' got here from: ' + _came_from);
            var _store_location = JSON.stringify({ last_page: window.location.pathname });
            $.cookie("Ovpnc_User_Settings", _store_location, {
                expires: 30,
                path: '/'
            });
        }

    }

    // Set up the navigation
    $.Ovpnc().slide("#sliding-navigation", 25, 15, 150, .8);

    // Set actions for clicks
    $.Ovpnc().clickBinds();

    // display welcome message
    // Only on main screen
    // Or if never displayed before
    if ($.cookie('Ovpnc_User_Settings') === null || $.Ovpnc().pathname === '/') {
        $.Ovpnc.username = ucfirst($('#login_username').attr('name'));
        alert($.Ovpnc().alertOk + 'Hello ' + $.Ovpnc.username
        + ', welcome to OpenVPN Controller!');
    }

    // Get status (loop)
    $.Ovpnc().pollStatus();

});

// Add a custom dynamic regex checker to jquery.validate
jQuery.validator.addMethod("test_regex", function(value, element, param) {
    return value.match(new RegExp("^." + param + "$"));
});


function test_edit(){
    $.Ovpnc().setAjaxLoading();
}
