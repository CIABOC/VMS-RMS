package lk.gov.ciaboc.rvm.vehicle;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface VehicleRepository extends JpaRepository<Vehicle, Long> {
    Optional<Vehicle> findByPlateNo(String plateNo);

    List<Vehicle> findByFlaggedTrueOrBlockedTrueOrderByPlateNoAsc();
}
