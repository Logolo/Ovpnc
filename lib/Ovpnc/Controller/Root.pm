package Ovpnc::Controller::Root;
use Moose;
use namespace::autoclean;

BEGIN { extends 'Catalyst::Controller' }

#
# Sets the actions in this controller to be registered with no prefix
# so they function identically to actions created in MyApp.pm
#
__PACKAGE__->config(namespace => '');

=head1 NAME

Ovpnc::Controller::Root - Root Controller for Ovpnc

=head1 DESCRIPTION

OpenVPN Controller Application

=head1 METHODS

=head2 base

Chain actions to login page

=cut

sub base : Chained('/login/required') PathPart('') CaptureArgs(0) { }


=head2 index

The Welcome page (/)

=cut

sub index : Path : Args(0) {
    my ( $self, $c ) = @_;
    # Hello World
    $c->response->body( $c->welcome_message );
}


=head2 default

Standard 404 error page

=cut

sub default : Path
{
    my ( $self, $c ) = @_;
    $c->response->body( 'Page not found' );
    $c->response->status(404);
}

=head2 test

test function

=cut

sub test : Chained('/base') PathPart('test') Args(0) {
    my ( $self, $c ) = @_;
    $c->res->body('<h2>Hello, user!</h2>');
}


=head2 ovpnc_config

Configuration Page

=cut

sub ovpnc_config : Chained('/base') PathPart('config') Args(0) 
{

	my ( $self, $c ) = @_;
	my $req = $c->request;
	$c->stash->{xml} = $c->config->{ovpnc_conf} || '/home/ovpnc/Ovpnc/root/xslt/ovpn.xml';
	$c->stash->{title} = 'Ovpnc Configuration';
	$c->forward('Ovpnc::View::XSLT');
}

=head2 end

Attempt to render a view, if needed.

=cut

sub end : ActionClass('RenderView') {}

=head1 AUTHOR

Nuriel Shem-Tov

=head1 LICENSE

This library is free software. You can redistribute it and/or modify
it under the same terms as Perl itself.

=cut

__PACKAGE__->meta->make_immutable;

1;
