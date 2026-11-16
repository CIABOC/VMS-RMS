package lk.gov.ciaboc.rvm.vehicle;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class VehiclePlateTest {

    @Test
    void platesAreNormalisedSoFormattingDoesNotCreateDuplicates() {
        assertThat(Vehicle.normalisePlate("wp cab-1234")).isEqualTo("WPCAB1234");
        assertThat(Vehicle.normalisePlate(" WP CAB 1234 ")).isEqualTo("WPCAB1234");
        assertThat(Vehicle.normalisePlate(null)).isEmpty();
    }
}
