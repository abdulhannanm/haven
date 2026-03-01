FROM node:20-bullseye

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip make \
    && rm -rf /var/lib/apt/lists/*

COPY . .

RUN make install

EXPOSE 3000 8000

CMD ["make", "dev"]
