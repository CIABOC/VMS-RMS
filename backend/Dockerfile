# Build context is the repository root (needs ../database/migrations).
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY database/migrations database/migrations
COPY backend/pom.xml backend/pom.xml
RUN mvn -q -f backend/pom.xml dependency:go-offline
COPY backend/src backend/src
RUN mvn -q -f backend/pom.xml -DskipTests package

FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 rvm
USER rvm
WORKDIR /app
COPY --from=build /src/backend/target/rvm-backend-*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
