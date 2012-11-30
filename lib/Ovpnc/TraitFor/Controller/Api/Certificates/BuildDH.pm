package Ovpnc::TraitFor::Controller::Api::Certificates::BuildDH;
use warnings;
use strict;
use IPC::Cmd qw( can_run run );
use Digest::MD5::File 'file_md5_hex';
use Moose::Role;

use constant TIMEOUT    => 60;


=head1 NAME

Ovpnc::TraitFor::Controller::Api::Certificates::BuildDH - Ovpnc Controller Trait

=head1 DESCRIPTION

Ovpnc Certificates BuildDH Trait

=head1 METHODS

=cut

=head2 build_dh

Generate a new DH file
Key size as specified
in the _cfg of Vars trait

=cut


sub build_dh
{
    my $self = shift;

    # Set key size
    # ============
    my $key_size = $self->_req->{key_size} // 1024;
    return { error => 'Invalid key size: ' . $key_size }
        unless ( $key_size ~~ [qw/1024 2048/] );

    # OpenVPN tools directory
    # =======================
    my $_tools_dir = $self->_cfg->{app_root}
                    . '/' . $self->_cfg->{vpn_dir}
                    . '/' . $self->_cfg->{utils_dir};

    # The DH file to process
    # ======================
    my $_dh_file = $_tools_dir . '/keys/dh' . $key_size . '.pem';

    # Confirm writable if exists
    # ===========================
    if ( -e $_dh_file && ! -w $_dh_file ) {
        return { error => $_dh_file . ' is not writable' };
    }

    # Get current digest if file exists
    # =================================
    my $_digest = $self->_verify_new( $_dh_file );

    # Verify the openssl binary
    # =========================
    my ( $_bin, $_cfg_bin );
    if ( $_bin = can_run('openssl') ){
        # Check if the binary found by IPC::Cmd
        # differs from the one provided
        # in the configuration of Ovpnc.
        if ( $_bin ne $self->_cfg->{ssl_bin} ){
            # First try the one from the configuration
            unless ( $_cfg_bin = can_run( $self->_cfg->{ssl_bin} ) ){
                # Ok, use the one found by IPC::Cmd
                $self->_cfg->{ssl_bin} = $_bin;
            }
        }
    }
    else {
        # Check if found / executable
        # ===========================
        if ( ! -e $self->_cfg->{ssl_bin} ){
            return { error => $self->_cfg->{ssl_bin} . ' is not found' };
        }
        elsif ( ! -x $self->_cfg->{ssl_bin} ){
            return { error => $self->_cfg->{ssl_bin} . ' is not executable' };
        }
    }

    # Prepare command
    # ===============
    my $_cmd = [
        $self->_cfg->{ssl_bin},
        'dhparam',
        '-out',
        $_dh_file,
        $key_size,
    ];

    # Run command
    # ===========
    my ($success, $error_code, $full_buf, $stdout_buf, $stderr_buf) =
        run( command => $_cmd, verbose => 0, timeout => TIMEOUT );

    my $_out = join( "\n", @{$full_buf} );

    # Format the output to display back to user
    # Note that the key_size is used for the regex
    # and it will match when success output.
    # ============================================
    $_out = $self->_format_output( $_out, $key_size );

    if ( $success ){
        # Check if a new file has
        # been created, compare to older
        # digest if any was existing.
        # ==============================
        my $_new_digest = $self->_verify_created(
            $_dh_file, ($_digest ? $_digest : undef)
        );
        # Not ok?
        # =======
        return { error => $_dh_file . ' was not created: ' . $_out }
            unless $_new_digest;

        # Chmod
        # =====
        chmod 0400, $_dh_file
            or $_out .= ';Warning! Could not chmod 0400 ' . $_dh_file . ': ' . $!;

        # Ok
        # ==
        return  {
            status => {
                filename => $_dh_file,
                digest   => $_new_digest,
                output   => $_out,
            }
        }
    }
    else {
        return { error => $_out . ';'
            . ( $error_code ? $error_code : '' )
        };
    }

}

=head2 _verify_new

Verify whether the file we are about
to create is new or not. If there is
already a file we save its digest
and later compare it with
the newely generated file.
MD5Sum returns to user when everything
goes alright.

=cut

sub _verify_new {
    my ( $self, $file ) = @_;
    return file_md5_hex( $file )
        if -e $file;
}

sub _verify_created {
    my ( $self, $file, $old_digest ) = @_;

    my $_new_digest = file_md5_hex( $file ) or return undef;

    return undef if $old_digest and $old_digest eq $_new_digest;

    return $_new_digest;
}

sub _format_output{
    my ( $self, $out, $key_size ) = @_;

    # Remove the phrases, dots and
    # characters generated by OpenSSL
    # ===============================
    $out =~ s/[\.|\+|\*]//g;
    $out =~ s/This is going to take a long time//g;
    $out =~ s/Generating DH parameters, $key_size bit long safe prime, generator 2//g;
    $out =~ s/\n//g;
    return $out;
}

1;
