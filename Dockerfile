FROM node:7-alpine
# docker build -t azerothian/graphene . && docker run --privilege -idt azerothian/graphene
ENV NODE_ENV development

RUN apk add --update build-base git openssl openssl-dev libtool automake autoconf curl python file p11-kit p11-kit-dev sqlite

RUN git clone https://github.com/opendnssec/SoftHSMv2.git /opt/softhsm

RUN cd /opt/softhsm && sh autogen.sh && ./configure && make && make install

RUN mkdir -p /app/build/

WORKDIR /app/

COPY package.json /app/

RUN ls

RUN cd /app/ && npm install

COPY / /app/

RUN chmod -x -R *

RUN npm install -g mocha

CMD npm test
