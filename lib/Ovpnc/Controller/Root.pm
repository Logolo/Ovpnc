package Ovpnc::Controller::Root;
use warnings;
use strict;
use Try::Tiny;
use Cwd;
use Ovpnc::Plugins::Sanity;
use Moose;
use namespace::autoclean;

BEGIN { extends 'Catalyst::Controller' }

#
# Sets the actions in this controller to be registered with no prefix
# so they function identically to actions created in MyApp.pm
#
__PACKAGE__->config( namespace => '' );

=head1 NAME

Ovpnc::Controller::Root - Root Controller for Ovpnc

=head1 DESCRIPTION

OpenVPN Controller Application

=head1 METHODS

=head2 base

Chain actions to login page

=cut

sub base : Chained('/login/required') PathPart('') CaptureArgs(0) {
}

=head2 auto

Automatic function
Runs before all actions
and test connection to database
is valid and okay

=cut

sub auto : Private {
    my ( $self, $c ) = @_;

    # Verify that the database is accessible
    # ======================================
    try { $c->model('DB::User')->count; }
    catch {
        if ($_ =~ /(DBI Connection failed: DBI connect\(.*\) failed: Can't connect to.*MySQL server through socket '.*')/ ){
            $c->log->error( $1 );
            push @{$c->stash->{errors}}, "Warning! Can't connecto to MySQL server!";
        }
        elsif ( $_ =~ /(DBI Connection failed: DBI connect\(.*\) failed: Access denied for user.*\(using password: [A-Z]*\))/g ){
            $c->log->error( $1 );
            push @{$c->stash->{errors}}, "Error: No connection to database! User denied.";
        }
        else {
            $c->log->error( $_ );
            push @{$c->stash->{errors}}, "Error: No connection to database!";
        }

        if ( $c->req->headers->{'accept'} =~ /text\/html|xhtml/
            or $c->req->headers->{'accept'} eq '*/*'
        ){
            $c->response->headers->header('Content-Type' => 'text/html');
            $self->include_default_links( $c );
            $c->detach('View::HTML');
        }
        if ( $c->req->headers->{'accept'} =~ /^([\w]*)\/xml$/i ){
            $c->res->body( $c->stash->{errors} );
            $c->detach;
        }
        if ( $c->req->headers->{'accept'} =~ /json/ ){
            delete $c->stash->{assets} if $c->stash->{assets};
            $c->response->headers->header('Content-Type' => 'text/html');
            $c->forward('View::JSON');
        }
        $c->detach;
    };
}

=head2 Method modifier

Will run sanity check
before any of the listed
methods execute

=cut

around [qw(ovpnc_config index)] => sub {
    my ( $orig, $self, $c ) = @_;

    # Set ovpnc conf location
    # =======================
    if ( $c->config->{ovpnc_conf} !~ /^\// ){
        $c->config->{ovpnc_conf} = getcwd . '/'
          . ( $ENV{PERL5LIB} ? $ENV{PERL5LIB} . '/' : '' )
          . ( getcwd =~ /Ovpnc$/ ? '' : 'Ovpnc' )
          . '/' . $c->config->{ovpnc_conf};
    }

    # Get the openvpn user
    # ====================
    $c->config->{openvpn_user} =
      Ovpnc::Controller::Api::Configuration->get_openvpn_param(
        $c->config->{ovpnc_conf}, 'UserName' );

    # Sanity check
    # ============
    my $_err = Ovpnc::Plugins::Sanity->action( $c->config );

    if ( $_err and ref $_err eq 'ARRAY' ) {
        $c->response->status(500);
        delete $c->stash->{assets} if $c->stash->{assets};
        $c->stash->{error} = $_err;
        $c->forward('View::JSON');
        $c->detach;
    }
    else {
        $self->_apply_username_to_stash( $c );
        return $self->$orig($c);
    }
};

=head2 index

Default main page

=cut

sub index : Chained('/base')
          : Path
          : Args(0)
          : Does('NeedsLogin')
          : Sitemap
{
    my ( $self, $c ) = @_;

    # Get username for geoname api service
    # ====================================
    $c->stash->{geo_username} = $c->config->{geo_username};

    # This page will be referred to as 'root'
    # =======================================
    $c->stash->{this_link} = 'root';

}

=head2 include_default_links

Include static files, dynamically

=cut

sub include_default_links : Private {
    my ( $self, $c ) = @_;

    # Include defaults
    # ================
    my @_page_assets = qw(
      css/normalize.css
      css/slider.css
      css/main.css
      js/Flexigrid/css/flexigrid.css
      js/jquery-latest.js
      js/Flexigrid/js/flexigrid.js
      js/jquery.cookie.js
      js/jquery.validate.js
      js/functions.js
    );

    push @_page_assets, 'js/main.js'
      if $c->user_exists;

    # Optional :
    #js/jquery-ui/css/smoothness/jquery-ui-1.9.1.custom.min.css
    #js/jquery-ui/js/jquery-ui-1.9.1.custom.min.js

    return 1 if $c->stash->{no_self};

    # Include according to pathname
    # not incase of 'main' ( path is undef )
    # ======================================
    if ( my $c_name = $c->req->path ) {
        $c_name =~ s/\/$//;
        for my $type (qw/ css js /) {
            push(
                @_page_assets,
                $type . '/' . $c_name . '.' . $type
            ) if ( -e $c->config->{home} . '/root/static/'
                    . $type . '/' . $c_name . '.' . $type
            );
        }
    }

    $c->assets->include( $_ ) for @_page_assets;

}

sub sitemap : Path('/sitemap') {
    my ( $self, $c ) = @_;
    $c->response->headers->header( 'Content-Type' => 'application/xml' );
    $c->stash( current_view => 'View::XML::Simple' );
    $c->response->body( $c->sitemap_as_xml );
}

=head2 default

Standard 404 error page

=cut

sub default : Path {
    my ( $self, $c ) = @_;
    $c->response->body('Page not found');
    $c->response->status(404);
}

=head2 ovpnc_config

Configuration Page

=cut

sub ovpnc_config : Chained('/base') PathPart("config") Args(0) {
    my ( $self, $c ) = @_;

    my $req = $c->request;
    $c->stash->{xml} = $c->config->{ovpnc_conf}
      || '/home/ovpnc/Ovpnc/root/xslt/ovpn.xml';
    $c->stash->{title} = 'Ovpnc Configuration';
    $c->forward('Ovpnc::View::XSLT');
}

=head2 end

Attempt to render a view, if needed.

=cut

sub end : ActionClass('RenderView') {
    my ( $self, $c ) = @_;

    # Include JS/CSS
    # ==============
    $self->include_default_links($c);

    $self->_apply_username_to_stash($c)
        unless $c->stash->{username};
}

=head2 _apply_username_to_stash

Gets the username currently logged in
and puts it into the stash

=cut

sub _apply_username_to_stash : Private
{
    my ( $self, $c ) = @_;
    if ( $c->user_exists ){
        $c->stash->{username} = $c->user->get("name");
        if ( $c->user->_user->{_column_data}->{username}
            && !$c->stash->{username}
        ){
            $c->stash->{username} =
                $c->user->_user->{_column_data}->{username};
        }
    }
}

=head1 AUTHOR

Nuriel Shem-Tov

=head1 LICENSE

This library is free software. You can redistribute it and/or modify
it under the same terms as Perl itself.

=cut

__PACKAGE__->meta->make_immutable;

1;
