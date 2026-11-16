package lk.gov.ciaboc.rvm.visit;

import lk.gov.ciaboc.rvm.masterdata.SettingsService;
import lk.gov.ciaboc.rvm.visit.VisitDtos.QueueToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Screen 06 public token display (waiting-room TV). No sign-in needed, so it returns
 * token numbers and a coarse state only - never names, hosts or purposes.
 */
@RestController
@RequestMapping("/api/public/queue")
public class PublicQueueController {
    private final VisitService service;
    private final SettingsService settings;

    public PublicQueueController(VisitService service, SettingsService settings) {
        this.service = service;
        this.settings = settings;
    }

    public record PublicQueue(int refreshSeconds, List<QueueToken> tokens) {}

    @GetMapping
    public PublicQueue queue() {
        return new PublicQueue(settings.getInt(SettingsService.QUEUE_REFRESH_SECONDS), service.publicQueue());
    }
}
