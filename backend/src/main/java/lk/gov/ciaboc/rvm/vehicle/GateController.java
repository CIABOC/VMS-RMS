package lk.gov.ciaboc.rvm.vehicle;

import jakarta.validation.Valid;
import lk.gov.ciaboc.rvm.vehicle.GateService.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Screens 10 (gate console) and 11 (gate and security dashboard data). */
@RestController
@RequestMapping("/api/gate")
@PreAuthorize("hasAnyRole('GATE_OFFICER','SECURITY_SUPERVISOR')")
public class GateController {
    private final GateService gate;

    public GateController(GateService gate) {
        this.gate = gate;
    }

    @GetMapping("/lookup")
    public Lookup lookup(@RequestParam String plate) {
        return gate.lookup(plate);
    }

    @PostMapping("/vehicles")
    public Vehicle register(@Valid @RequestBody VehicleRequest body) {
        return gate.register(body);
    }

    @PutMapping("/vehicles/{id}/flag")
    @PreAuthorize("hasRole('SECURITY_SUPERVISOR')")
    public Vehicle flag(@PathVariable Long id, @Valid @RequestBody FlagRequest body) {
        return gate.flag(id, body);
    }

    @PostMapping("/movements")
    public MovementView record(@Valid @RequestBody MovementRequest body) {
        return gate.record(body);
    }

    @GetMapping("/movements/today")
    public List<MovementView> today(@RequestParam(defaultValue = "100") int limit) {
        return gate.movementsToday(limit);
    }

    @GetMapping("/inside")
    public List<InsideVehicle> inside() {
        return gate.inside();
    }

    @GetMapping("/watch-list")
    public List<Vehicle> watchList() {
        return gate.watchList();
    }
}
