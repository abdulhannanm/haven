FROM node:20-bullseye

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip make \
    && rm -rf /var/lib/apt/lists/*

COPY test_app ./test_app

RUN cd /app/test_app && make install

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000 8000

CMD ["docker-entrypoint.sh"]
