FROM node:7-alpine
# docker build -t azerothian/graphene . && docker run --privilege -idt azerothian/graphene
ENV NODE_ENV development

RUN apk add --update build-base git openssl-dev libtool automake autoconf curl python

RUN git clone https://github.com/opendnssec/SoftHSMv2.git /opt/softhsm

RUN cd /opt/softhsm && sh autogen.sh && ./configure && make && make install

RUN mkdir -p /app/build/

WORKDIR /app/

COPY package.json /app/

RUN ls

RUN cd /app/ && npm install

# RUN apk del build-base git openssl-dev libtool automake autoconf curl

COPY / /app/

CMD ulimit -l unlimited && npm test
