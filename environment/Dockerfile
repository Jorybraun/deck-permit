FROM vcr.vercel.com/jory-brauns-projects/pipey/pipey-devin-desktop@sha256:8d97a69239c310b6a638d18fd36405050763e7b2b2fff61878d87f515e3c4234

ENV VNC_PW="" VNC_VIEW_ONLY_PW=""

USER root
RUN curl --fail --silent --show-error https://nodejs.org/dist/v24.16.0/node-v24.16.0-linux-x64.tar.xz -o /tmp/node.tar.xz \
    && echo 'd804845d34eddc21dc1092b519d643ef40b1f58ec5dec5c22b1f4bd8fabde6c9  /tmp/node.tar.xz' | sha256sum --check - \
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
    && rm /tmp/node.tar.xz

WORKDIR /opt/pipey-deck-runtime
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund \
    && sha256sum package.json package-lock.json > package-digests.txt \
    && ln -s /opt/pipey-deck-runtime/node_modules /node_modules \
    && npm cache clean --force

WORKDIR /workspace
USER 1000
