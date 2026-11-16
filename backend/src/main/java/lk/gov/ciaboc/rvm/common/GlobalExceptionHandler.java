package lk.gov.ciaboc.rvm.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;
import java.util.Map;
import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    public record ErrorBody(Instant timestamp, int status, String message, Map<String, String> fieldErrors) {}

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ErrorBody> api(ApiException e) {
        return body(e.getStatus(), e.getMessage(), null);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ErrorBody> validation(MethodArgumentNotValidException e) {
        Map<String, String> fields = e.getBindingResult().getFieldErrors().stream()
                .collect(Collectors.toMap(f -> f.getField(),
                        f -> f.getDefaultMessage() == null ? "invalid" : f.getDefaultMessage(),
                        (a, b) -> a));
        return body(HttpStatus.BAD_REQUEST, "Please correct the highlighted fields", fields);
    }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ErrorBody> denied(AccessDeniedException e) {
        return body(HttpStatus.FORBIDDEN, "You do not have permission for this action", null);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ErrorBody> integrity(DataIntegrityViolationException e) {
        String msg = String.valueOf(e.getMostSpecificCause().getMessage());
        String friendly = "The change conflicts with existing records";
        if (msg.contains("ex_appointment_overlap")) friendly = "The host already has an appointment in this time slot";
        else if (msg.contains("ux_device_tag_held")) friendly = "That device tag is already in use";
        else if (msg.contains("ux_visitor_identity")) friendly = "A visitor with this identity document already exists";
        else if (msg.contains("ux_staff_email")) friendly = "A staff member with this e-mail already exists";
        else if (msg.contains("ux_visit_token")) friendly = "Token allocation clashed, please try again";
        log.warn("Integrity violation: {}", msg);
        return body(HttpStatus.CONFLICT, friendly, null);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<ErrorBody> illegal(IllegalArgumentException e) {
        return body(HttpStatus.BAD_REQUEST, e.getMessage(), null);
    }

    private ResponseEntity<ErrorBody> body(HttpStatus status, String message, Map<String, String> fields) {
        return ResponseEntity.status(status).body(new ErrorBody(Instant.now(), status.value(), message, fields));
    }
}
