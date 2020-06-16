# FROM node:9.9.0
# ARG VERSION_TAG
# RUN git clone -b $VERSION_TAG https://github.com/DuoSoftware/DVP-Wallet.git /usr/local/src/walletservice
# RUN cd /usr/local/src/walletservice;
# WORKDIR /usr/local/src/walletservice
# RUN npm install
# EXPOSE 8880
# CMD [ "node", "/usr/local/src/walletservice/app.js" ]


FROM node:10-alpine
WORKDIR /usr/local/src/walletservice
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 8880
CMD [ "node", "app.js" ]

