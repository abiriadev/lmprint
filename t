#!/nix/store/byi2zpy2bgcf3dr6y0l8m50rmjj8z7q1-bash-5.3p15/bin/bash
node -v > .node-version

pnpm add -D \
	prettier \
	typescript \
	@types/node \
	tsx \
	@swc/core \
	@swc/cli
