package lk.gov.ciaboc.rvm;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class RvmApplication {
    public static void main(String[] args) {
        SpringApplication.run(RvmApplication.class, args);
    }
}
