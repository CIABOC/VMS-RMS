package lk.gov.ciaboc.rvm.staff;

import jakarta.persistence.*;
import lk.gov.ciaboc.rvm.security.Role;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.EnumSet;
import java.util.Set;

@Entity
@Table(name = "staff_user")
@Getter
@Setter
public class StaffUser {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String email;
    private String fullName;
    private String designation;
    private String department;
    private String mobile;
    private boolean active = true;
    private Instant createdAt = Instant.now();

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "staff_role", joinColumns = @JoinColumn(name = "staff_id"))
    @Column(name = "role")
    @Enumerated(EnumType.STRING)
    private Set<Role> roles = EnumSet.noneOf(Role.class);
}
