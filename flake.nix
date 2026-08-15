{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = (
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      with pkgs;
      {
        devShells.default = mkShell {
          packages = [
            nodejs
            pnpm
            wrangler
          ];

          shellHook = ''
            export PUPPETEER_SKIP_DOWNLOAD=1
            export PUPPETEER_EXECUTABLE_PATH=${lib.getExe chromium}
            # workerd (wrangler dev) has no built-in CA store and cannot find one
            # on NixOS, so outbound TLS (native fetch and cloudflare:sockets
            # startTls) fails with "unable to get local issuer certificate".
            export SSL_CERT_FILE=${cacert}/etc/ssl/certs/ca-bundle.crt
          '';
        };
      }
    )
  );
}
