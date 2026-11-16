package lk.gov.ciaboc.rvm.vehicle;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;

public interface VehicleMovementRepository extends JpaRepository<VehicleMovement, Long> {
    List<VehicleMovement> findByVehicleIdOrderByOccurredAtDescIdDesc(Long vehicleId, Pageable pageable);

    List<VehicleMovement> findByOccurredAtGreaterThanEqualOrderByOccurredAtDescIdDesc(Instant since, Pageable pageable);
}
