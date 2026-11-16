package lk.gov.ciaboc.rvm.masterdata;

import jakarta.persistence.*;
import lk.gov.ciaboc.rvm.security.Role;
import lombok.Getter;
import lombok.Setter;

/** SSO directory group -> application role. Consumed by the SSO integration once merged. */
@Entity
@Table(name = "role_mapping")
@Getter
@Setter
public class RoleMapping {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String ssoGroup;
    @Enumerated(EnumType.STRING)
    private Role role;
}
