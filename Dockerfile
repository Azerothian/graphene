FROM node:7-alpine
# docker build -t azerothian/graphene . && docker run --privilege -idt azerothian/graphene
ENV NODE_ENV development

RUN apk add --update build-base git openssl-dev libtool automake autoconf curl python file p11-kit-dev

RUN git clone https://github.com/opendnssec/SoftHSMv2.git /opt/softhsm

RUN cd /opt/softhsm && sh autogen.sh && ./configure --disable-non-paged-memory && make && make install

RUN mkdir -p /app/build/

WORKDIR /app/

COPY package.json /app/

RUN ls

RUN cd /app/ && npm install

COPY / /app/

CMD npm test
