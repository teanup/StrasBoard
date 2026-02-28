# Build
FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY *.go ./
COPY dht22/ dht22/
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /app

# Run
FROM scratch
COPY --from=build /app /app
EXPOSE $PORT
ENTRYPOINT ["/app"]
