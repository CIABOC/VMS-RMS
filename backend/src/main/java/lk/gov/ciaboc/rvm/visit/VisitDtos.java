package lk.gov.ciaboc.rvm.visit;

import jakarta.validation.constraints.*;
import lk.gov.ciaboc.rvm.audit.AuditEvent;
import lk.gov.ciaboc.rvm.device.DeviceCustody;
import lk.gov.ciaboc.rvm.visitor.Visitor;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Request and response shapes for the visit API. Entities are never returned directly. */
public final class VisitDtos {
    private VisitDtos() {}

    // ---------- requests
    public record CreateVisit(@NotNull Long visitorId, @NotNull Long categoryId, @NotNull Long hostId,
                              Long appointmentId, @Size(max = 500) String purpose) {}

    public record Verify(@NotBlank @Pattern(regexp = "REUSED_SCAN|NEW_SCAN|EXCEPTION") String method,
                         @Size(max = 500) String note) {}

    public record Sign(@NotBlank @Pattern(regexp = "en|si|ta") String language,
                       @NotBlank @Size(max = 700_000) String signaturePng) {}

    public record HostResponse(@NotBlank @Pattern(regexp = "ACCEPT|DELAY|REDIRECT|DECLINE") String action,
                               @Min(1) @Max(240) Integer delayMinutes,
                               Long redirectHostId,
                               @Size(max = 500) String note) {}

    public record ApproveEntry(@NotBlank @Size(max = 30) String badgeNo, boolean deviceCustodyConfirmed) {}

    public record AddItem(@NotBlank @Size(max = 300) String description, @Min(1) @Max(999) int quantity) {}

    public record Cancel(@NotBlank @Size(min = 5, max = 500) String reason) {}

    // ---------- responses
    public record VisitSummary(Long id, LocalDate visitDate, Integer tokenNo, VisitStatus status,
                               Long visitorId, String visitorName, String visitorOrganization,
                               String categoryName, Long hostId, String hostName, String purpose,
                               Instant createdAt, Instant signedAt, Instant hostRespondedAt, Instant delayUntil,
                               String hostResponseNote, String badgeNo, Instant entryApprovedAt, Instant checkedOutAt) {
        public static VisitSummary of(Visit v) {
            return new VisitSummary(v.getId(), v.getVisitDate(), v.getTokenNo(), v.getStatus(),
                    v.getVisitor().getId(), v.getVisitor().getFullName(), v.getVisitor().getOrganization(),
                    v.getCategory().getName(), v.getHost().getId(), v.getHost().getFullName(), v.getPurpose(),
                    v.getCreatedAt(), v.getSignedAt(), v.getHostRespondedAt(), v.getDelayUntil(),
                    v.getHostResponseNote(), v.getBadgeNo(), v.getEntryApprovedAt(), v.getCheckedOutAt());
        }
    }

    public record VerificationStatus(boolean hasStoredScan, Instant scannedAt, Long scanAgeDays, int reuseDays,
                                     boolean reuseAllowed, boolean scannedToday, String currentMethod) {}

    public record VisitDetail(VisitSummary summary, Visitor visitor, Long categoryId,
                              boolean requiresDeviceCustody, Long appointmentId,
                              String idVerification, String idVerificationNote, Instant verifiedAt, String verifiedBy,
                              Long ackTextId, String ackLanguage, boolean signed,
                              String entryApprovedBy, List<VisitItem> items, List<DeviceCustody> devices,
                              List<AuditEvent> history) {}

    public record QueueToken(int tokenNo, String state) {}
}
