/* jquery validator settings */
jQuery.validator.setDefaults({
    debug: true,
    success: "valid"
});

/* addClient namespace */
(function($) {

    $.addClient = function(options) {
        var obj = $.extend({},
        actions );
        return obj;
    };

    $.addClient.form_modified = 0;

    //
    // addClient actions
    //
    actions = {
        set_form_events: function(){
            // Set validation rules
            $.addClient().set_form_validation_rules();
            // Set keyup for all inputs
            $('input').bind('keyup',function(e){
                // Prevent submit by pressing enter
                if (e.which == 13) return false;
                // Remove previous warnings if any
                $(this).parent('div').find('span').remove();
                $(this).parent('div').find('label').css('color','#000000');
            });
            // On form submission
            $('form#add_client_form').submit(function(){
                // Check password length and strength
                var _pw_length = $('input#password').attr('value');
                if ( _pw_length.length < 8 ) {
                    $('input#password').parent('div').find('span').remove();
                    $('input#password').parent('div').prepend('<span class="error_message error_constraint_required">Minimum 8 characters</span>');
                    $('input#password').parent('div').find('label').css('color','#ff0000');
                    return false;
                }
                // Don't submit if passwords don't match or weak
                var current = $('input#password2').attr('value');
                var first = $('input#password').attr('value');
                if ( ! $.Ovpnc().verify_passwords_match(first, current, 'password2' ) ) return false;
                // Don't submit if passwords are
                if ( $('.top_badPass').is(':visible') ) {
                    $('input#password').parent('div').find('span').remove();
                    $('input#password').parent('div').prepend('<span class="error_message error_constraint_required">Password is too weak!</span>');
                    $('input#password').parent('div').find('label').css('color','#ff0000');
                    return false;
                }
            });
            $('input#username').bind('keyup',function(){
                var _name = this.value;
                if ( _name === undefined || _name == '' ) return;
                $.Ovpnc().get_data('/api/clients', { username: _name }, 'GET', return_client_data, return_ajax_error );
            });
            $('input#email').bind('keyup',function(){
                var _name = this.value;
                if ( _name === undefined || _name == '' ) return;
                $.Ovpnc().get_data('/api/clients', { email: _name }, 'GET', return_client_data, return_ajax_error );
            });
            $('input#password2').bind('keyup',function(){
                var current = $('input#password2').attr('value');
                var first = $('input#password').attr('value');
                $.Ovpnc().verify_passwords_match( first, current, 'password2' );
            });
            $('#generate_password').bind('mousedown',function(){
                $('#generate_password').css('border','1px solid #999999')
                                       .css('color','#555555');
            }).bind('mouseup',function(){
                $('#generate_password').css('border','')
                                       .css('color','#000000');
            }).click(function(){
                var _token = $('#token').attr('value');
                var _pass = $.Ovpnc().generate_password(_token);
                $('#password2').parent('div').find('span').remove();
                $('#password2').parent('div').find('label').css('color','#000000');
                $('#password2').parent('div').prepend('<span class="error_message" style="color:#000000"><input name="generated_password" readonly type="text" value="' + _pass + '" style="width:90px;border:0" onClick="this.select()"></text></span>');
                $('#password').attr('value', _pass ).keyup();
                $('#password2').attr('value', _pass );
            });
        },
        // Form validation rules
        set_form_validation_rules: function(){
            // Form validation rules
            $("#add_client_form").validate({
                rules: {
                    username: {
                        required: true,
                        maxlength: 42
                    },
                    password: {
                        required: true,
                        maxlength: 72
                    },
                    email: {
                        required: true,
                        maxlength: 72,
                        email: true
                    },
                    phone: {
                        required: true,
                        maxlength: 42
                    },
                    address: {
                        required: true,
                        maxlength: 128
                    }
                }
            });
        },
        // Confirm unsaved modifications
        // on user leave page
        confirm_exit: function(){
            if ( $.addClient.form_modified === 0 ) return true;

            var data = new Object();

            data = {
                username : $('#username').attr('value'),
                email : $('#email').attr('value'),
                address: $('#address').attr('value'),
                phone: $('#phone').attr('value'),
                fullname: $('#fullname').attr('value')
            };

            if ( $.cookie( "Ovpnc_addClient_Form_Settings" ) !== null ){
                console.log('removed old cookie');
                $.removeCookie("Ovpnc_addClient_Form_Settings");
            }
            var Settings = JSON.stringify( data );
            $.cookie( "Ovpnc_addClient_Form_Settings", Settings, { expires: 30, path: '/' } );
            return "Unsaved modifications";
        },
        // Confirm leave page
        set_confirm_exit: function(){
            if (  $.addClient.form_modified === 0 ) {
                //console.log('Set check saved config');
                $.addClient.form_modified = 1;
                // On window unload
                window.onbeforeunload = $.addClient().confirm_exit;
            }
        },
        // Set the input fields
        // from the cookie
        set_form_from_cookie: function(data){
            if ( data !== undefined ){
                if ( data.username !== '' ){
                    $('#username').attr('value', data.name);
                }
                if ( data.email !== '' ){
                    $('#email').attr('value', data.email);
                }
            }
        }
    };
})(jQuery);

$(document).ready( function() {

    $("#password").passStrength({
        shortPass:      "top_shortPass",
        badPass:        "top_badPass",
        goodPass:       "top_goodPass",
        strongPass:     "top_strongPass",
        baseStyle:      "top_testresult",
        userid:         "#username",
        messageloc:     1
    });

    var cookie_data = new Object();

    // Preload cookie
    if ( $.cookie('Ovpnc_addClient_Form_Settings') !== null ){
        cookie_data = jQuery.parseJSON( $.cookie('Ovpnc_addClient_Form_Settings') );
        $.addClient().set_form_from_cookie( cookie_data );
    }
    // If we saved the previous fields in a
    // cookie, load from the cookie.
    if ( cookie_data !== undefined && cookie_data.username !== undefined ){
        $.Ovpnc.cookie = cookie_data;
        for ( var k in cookie_data ){
            if (cookie_data[k] !== '' )
                $('#'+k).attr('value',cookie_data[k]);
        }
    }
    $.addClient().set_confirm_exit();
});

// Handle returned error
function return_ajax_error(e){
    console.log("error: %o",e);
}

// Handle client returned data
function return_client_data(r){
    // Expect one field
    if ( r.rest !== undefined ){
        var keys = [];
        for (var k in r.rest){
            keys.push(k);
        }
        if ( r.rest[keys[0]] !== null  ){
            $('input#' + keys[0]).parent('div').prepend('<span class="error_message error_constraint_required">' + keys[0] + ' already exists</span>');
            $('input#' + keys[0]).parent('div').find('label').css('color','#ff0000');
        }
    }
}